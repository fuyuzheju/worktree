import type { HistoryOperation, Node, Stats, TreeOperation } from '@worktree/core';
import { ServerAPI } from './api';
import { ServerSocket } from './socket';
import { ClientStore } from './store';
import { Syncer } from './syncer';
import type { Conflict, SyncResult } from './syncer';

export interface WorktreeClientOptions {
  /** e.g. http://localhost:3000 */
  serverUrl: string;
  /** Defaults to ws(s)://<serverUrl host>/websocket. */
  wsUrl?: string;
}

/**
 * The client kernel: the only interface the frontend uses to read and
 * mutate worktree data. Edits are applied optimistically and queued;
 * sync() flushes them and catches up with the server.
 */
export class WorktreeClient {
  private store = new ClientStore();
  private api: ServerAPI;
  private socket: ServerSocket;
  private syncer: Syncer;
  private listeners = new Set<(tree: Node) => void>();
  private conflict: Conflict | null = null;
  private online = false;
  private syncing = false;

  constructor(options: WorktreeClientOptions) {
    const base = options.serverUrl.replace(/\/+$/, '');
    this.api = new ServerAPI(base);
    this.socket = new ServerSocket(options.wsUrl ?? defaultWsUrl(base), {
      onOpen: () => {
        void this.handleReconnect();
      },
      onClose: () => {
        this.setOnline(false);
      },
      onOp: (node) => {
        this.store.applyConfirmed(node);
        this.emit();
      },
      onRemoved: (id) => {
        this.store.applyRemoved(id);
        this.emit();
      },
      onHistoryReplaced: () => {
        void this.handleReconnect();
      },
      onState: (state) => {
        this.setOnline(state === 'working');
        if (state === 'working') void this.handleReconnect();
      },
    });
    this.syncer = new Syncer(this.store, this.api);
  }

  connect(): void {
    this.socket.connect();
  }

  disconnect(): void {
    this.socket.close();
  }

  getTree(): Node {
    return this.store.getTree();
  }

  getStats(): Promise<Stats> {
    return this.api.stats();
  }

  getConflict(): Conflict | null {
    return this.conflict;
  }

  isOnline(): boolean {
    return this.online;
  }

  /** Optimistic local edit; pushed to the server by sync(). */
  apply(op: TreeOperation): void {
    this.store.applyLocal(op);
    this.emit();
  }

  /** Notifies on every tree change. Returns an unsubscribe function. */
  subscribe(listener: (tree: Node) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Push pending ops and catch up. Resolves to 'conflict' when the server rejected them. */
  async sync(): Promise<SyncResult> {
    const result = await this.syncer.sync();
    this.conflict = this.syncer.getConflict();
    this.emit();
    return result;
  }

  /** After a conflict: keep the server's history, or force-rewrite it with ours. */
  async resolveConflict(choice: 'server' | 'local', chosenOps?: HistoryOperation[]): Promise<void> {
    await this.syncer.resolveConflict(choice, chosenOps);
    this.conflict = null;
    this.emit();
  }

  private async handleReconnect(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      await this.syncer.catchUp();
      this.setOnline(true);
      this.emit();
    } catch {
      // Still unreachable; the socket keeps retrying.
    } finally {
      this.syncing = false;
    }
  }

  private setOnline(online: boolean): void {
    if (this.online === online) return;
    this.online = online;
    this.emit();
  }

  private emit(): void {
    const tree = this.getTree();
    for (const l of [...this.listeners]) l(tree);
  }
}

function defaultWsUrl(base: string): string {
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/websocket';
  return url.toString();
}
