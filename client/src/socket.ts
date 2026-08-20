import type { HistoryNode, ServerMessage, ServerState } from '@worktree/core';

export interface SocketHandlers {
  onOpen: () => void;
  onClose: () => void;
  onOp: (node: HistoryNode) => void;
  onRemoved: (id: string) => void;
  onHistoryReplaced: () => void;
  onState: (state: ServerState) => void;
}

/** WebSocket receiver with auto-reconnect. */
export class ServerSocket {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private reconnectDelay = 1000;

  constructor(
    private url: string,
    private handlers: SocketHandlers,
  ) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.handlers.onOpen();
    };
    this.ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      switch (message.type) {
        case 'op':
          this.handlers.onOp(message.node);
          break;
        case 'removed':
          this.handlers.onRemoved(message.id);
          break;
        case 'history-replaced':
          this.handlers.onHistoryReplaced();
          break;
        case 'state':
          this.handlers.onState(message.state);
          break;
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      this.handlers.onClose();
      if (!this.closedByUser) {
        setTimeout(() => this.open(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      }
    };
  }
}
