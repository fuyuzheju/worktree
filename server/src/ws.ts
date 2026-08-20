import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMessage } from '@worktree/core';
import { getState } from './state';

export const WS_PATH = '/websocket';

/** Broadcasts history updates to all connected clients. */
export class WsHub {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== WS_PATH) return;
      if (getState() === 'offline') {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
    });
  }

  broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  closeAll(): void {
    for (const client of this.wss.clients) client.close(1001, 'server offline');
  }
}
