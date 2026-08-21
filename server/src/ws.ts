import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '@worktree/core';
import { getState } from './state';
import { parseUsername } from './user';

export const WS_PATH = '/websocket';

/** Broadcasts history updates to the connections of each user. */
export class WsHub {
  private wss: WebSocketServer;
  private sockets = new Map<string, Set<WebSocket>>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== WS_PATH) return;
      const user = parseUsername(url.searchParams.get('user'));
      if (user === null) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }
      if (getState(user) === 'offline') {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        let set = this.sockets.get(user);
        if (!set) {
          set = new Set();
          this.sockets.set(user, set);
        }
        set.add(ws);
        ws.on('close', () => {
          set.delete(ws);
          if (set.size === 0) this.sockets.delete(user);
        });
        this.wss.emit('connection', ws, req);
      });
    });
  }

  broadcastTo(user: string, message: ServerMessage): void {
    const payload = JSON.stringify(message);
    const set = this.sockets.get(user);
    if (!set) return;
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  /** Close one user's connections (their rewrite takes them offline). */
  closeUser(user: string): void {
    const set = this.sockets.get(user);
    if (!set) return;
    for (const client of set) client.close(1001, 'server offline');
  }

  closeAll(): void {
    for (const client of this.wss.clients) client.close(1001, 'server offline');
  }
}
