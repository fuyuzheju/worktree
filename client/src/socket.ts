import type { HistoryNode, ServerMessage, ServerState } from '@worktree/core';

export interface SocketHandlers {
  onOpen: () => void;
  onClose: () => void;
  onOp: (node: HistoryNode) => void;
  onRemoved: (id: string) => void;
  onHistoryReplaced: () => void;
  onState: (state: ServerState) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** WebSocket receiver with automatic backoff reconnect and manual one-shot reconnect. */
export class ServerSocket {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private reconnectDelay = 1000;
  /**
   * Bumped by connect()/reconnect()/close() to invalidate sockets and
   * reconnect loops from before the intervention. open() itself does not
   * bump it, so a loop's own attempts stay valid.
   */
  private generation = 0;
  private loopGen: number | null = null;

  constructor(
    private url: string,
    private handlers: SocketHandlers,
  ) {}

  connect(): void {
    if (this.ws !== null) return;
    this.closedByUser = false;
    this.generation++;
    void this.open();
  }

  /** One immediate manual attempt; cancels any pending automatic reconnect. */
  reconnect(): Promise<boolean> {
    this.closedByUser = false;
    this.generation++;
    this.ws?.close();
    this.ws = null;
    return this.open();
  }

  close(): void {
    this.closedByUser = true;
    this.generation++;
    this.ws?.close();
    this.ws = null;
  }

  /** Open a single connection. Resolves true when the handshake succeeded, false when it closed first. */
  private open(): Promise<boolean> {
    const gen = this.generation;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        resolve(true);
        if (gen !== this.generation) return; // superseded by a manual action
        this.reconnectDelay = 1000;
        this.handlers.onOpen();
      };
      ws.onmessage = (event) => {
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
      ws.onclose = () => {
        if (gen === this.generation) this.ws = null;
        if (!settled) {
          settled = true;
          resolve(false);
        }
        // A superseded socket (manual reconnect or close) stays silent.
        if (gen !== this.generation) return;
        this.handlers.onClose();
        if (!this.closedByUser) this.startAutoReconnect();
      };
    });
  }

  private startAutoReconnect(): void {
    const gen = this.generation;
    if (this.loopGen === gen) return;
    this.loopGen = gen;
    void this.autoReconnect(gen).finally(() => {
      if (this.loopGen === gen) this.loopGen = null;
    });
  }

  /** Backoff loop: sleep, attempt, check. Ends on success, close(), or a manual reconnect. */
  private async autoReconnect(gen: number): Promise<void> {
    await sleep(this.reconnectDelay);
    if (gen !== this.generation || this.closedByUser) return;
    const ok = await this.open();
    if (ok) return;
    if (gen !== this.generation || this.closedByUser) return;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    return this.autoReconnect(gen);
  }
}
