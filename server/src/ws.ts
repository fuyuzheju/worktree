import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '@worktree/core';
import { resolveToken } from './auth';
import { getState } from './state';

export const WS_PATH = '/api/websocket';

/** Broadcasts history updates to the connections of each user. */
export class WsHub {
  private wss: WebSocketServer;
  private sockets = new Map<string, Set<WebSocket>>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });
    // 'upgrade' does not await listeners — a rejected promise here would
    // become an unhandledRejection, so everything runs inside one guarded
    // async IIFE and the socket is destroyed on any failure.
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== WS_PATH) return;
      void (async () => {
        try {
          const token = url.searchParams.get('token');
          const resolved = token === null ? null : await resolveToken(token);
          if (resolved === null) {
            if (!socket.destroyed) {
              socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
              socket.destroy();
            }
            return;
          }
          const user = resolved.username;
          if (getState(user) === 'offline') {
            if (!socket.destroyed) {
              socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
              socket.destroy();
            }
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
        } catch (e) {
          console.error(e);
          if (!socket.destroyed) socket.destroy();
        }
      })();
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
