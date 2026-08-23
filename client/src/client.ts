import { ROOT_ID, USER_RE, newId } from '@worktree/core';
import type { HistoryNode, HistoryOperation, Node, Stats, Timestamp, TreeOperation } from '@worktree/core';
import { ServerAPI } from './api';
import { ServerSocket } from './socket';
import { ClientStore } from './store';
import { Syncer } from './syncer';
import type { Conflict, SyncResult } from './syncer';
import type { ClientStorage } from './storage';

export interface WorktreeClientOptions {
  /** e.g. http://localhost:3000 */
  serverUrl: string;
  /** The identity sent as X-User / ?user=; the storage namespace key. */
  user: string;
  /** Offline-only: never talks to the server; ops go straight into the confirmed history. */
  local?: boolean;
  /** Defaults to ws(s)://<serverUrl host>/api/websocket. */
  wsUrl?: string;
  /** Platform storage for confirmed history + pending queue; without it nothing persists. */
  storage?: ClientStorage;
}

/**
 * The client kernel: the only interface the frontend uses to read and
 * mutate worktree data. Edits are applied optimistically and queued;
 * sync() flushes them and catches up with the server.
 */
export class WorktreeClient {
  private store: ClientStore;
  private storage: ClientStorage | null;
  private api: ServerAPI;
  private socket: ServerSocket;
  private syncer: Syncer;
  private listeners = new Set<(tree: Node) => void>();
  private conflict: Conflict | null = null;
  private online = false;
  private syncing = false;
  private local: boolean;

  constructor(options: WorktreeClientOptions) {
    if (!USER_RE.test(options.user)) {
      throw new Error(`invalid username: ${options.user} (allowed: ${USER_RE.source})`);
    }
    this.local = options.local === true;
    this.storage = options.storage ?? null;
    this.store = new ClientStore((state) => this.storage?.save(state));
    const saved = this.storage?.load();
    if (saved) this.store.restore(saved.confirmed, saved.pending);

    const base = options.serverUrl.replace(/\/+$/, '');
    this.api = new ServerAPI(base, options.user);
    this.socket = new ServerSocket(withUserParam(options.wsUrl ?? defaultWsUrl(base), options.user), {
      onOpen: () => {
        void this.resync();
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
        void this.resync();
      },
      onState: (state) => {
        this.setOnline(state === 'working');
        if (state === 'working') void this.resync();
      },
    });
    this.syncer = new Syncer(this.store, this.api);
  }

  connect(): void {
    if (!this.local) this.socket.connect();
  }

  disconnect(): void {
    this.socket.close();
  }

  getTree(): Node {
    return this.store.getTree();
  }

  getStats(): Promise<Stats> {
    if (this.local) {
      const tree = this.getTree();
      return Promise.resolve({
        opCount: this.store.getConfirmed().length,
        nodeCount: countNodes(tree),
        reminderCount: countReminders(tree),
        state: 'working',
      });
    }
    return this.api.stats();
  }

  /** Number of ops still waiting for server confirmation. */
  getPendingCount(): number {
    return this.store.getPending().length;
  }

  /** Confirmed history nodes (what the server has accepted). */
  getConfirmed(): HistoryNode[] {
    return this.store.getConfirmed();
  }

  /** Pending (unconfirmed) history operations. */
  getPending(): HistoryOperation[] {
    return this.store.getPending();
  }

  getConflict(): Conflict | null {
    return this.conflict;
  }

  isOnline(): boolean {
    return this.online;
  }

  isLocal(): boolean {
    return this.local;
  }

  /** Optimistic local edit; flushed to the server automatically while online. */
  apply(op: TreeOperation): void {
    if (this.local) {
      this.store.applyLocalConfirmed(op);
      this.emit();
      return;
    }
    this.store.applyLocal(op);
    this.emit();
    if (this.online) void this.resync();
  }

  // Semantic operations: the kernel generates ids and default weights so
  // callers (CLI, web UI) never construct TreeOperations themselves.

  /** Add a node; default weight appends it after its siblings. Returns the new node id. */
  addNode(parentId: string, name: string, weight?: number, fields?: { note?: string; deadline?: Timestamp }): string {
    this.validateName(name);
    const parent = parentId === ROOT_ID ? this.getTree() : findNode(this.getTree(), parentId);
    if (!parent) throw new Error(`unknown parent id: ${parentId}`);
    this.ensureUniqueSiblingName(parent, name);
    const id = newId();
    this.apply({
      kind: 'add',
      parentId,
      id,
      name,
      weight: weight ?? this.nextWeight(parentId),
      note: fields?.note,
      deadline: fields?.deadline,
      createdAt: Date.now(),
    });
    return id;
  }

  removeNode(id: string): void {
    this.apply({ kind: 'remove', id });
  }

  renameNode(id: string, name: string): void {
    this.validateName(name);
    const found = findNodeWithParent(this.getTree(), id);
    if (found) this.ensureUniqueSiblingName(found.parent, name, found.node.id);
    this.apply({ kind: 'rename', id, name });
  }

  /** Move a node; without a weight it keeps its current ordering weight. */
  moveNode(id: string, parentId: string, weight?: number): void {
    const tree = this.getTree();
    const current = findNode(tree, id);
    const target = parentId === ROOT_ID ? tree : findNode(tree, parentId);
    if (current && target) this.ensureUniqueSiblingName(target, current.name, current.id);
    this.apply({ kind: 'move', id, parentId, weight: weight ?? current?.weight ?? 0 });
  }

  /** Shallow-copy a node (name, status, reminders — no children). Returns the copy's id.
   *  On a sibling name collision the copy gets a unique name: `X (copy)`, `X (copy 2)`, ... */
  copyNode(id: string, parentId: string, weight?: number): string {
    const tree = this.getTree();
    const src = findNode(tree, id);
    if (!src) throw new Error(`unknown node id: ${id}`);
    const parent = parentId === ROOT_ID ? tree : findNode(tree, parentId);
    if (!parent) throw new Error(`unknown parent id: ${parentId}`);
    const name = this.uniqueCopyName(parent, src.name);
    const newId_ = newId();
    this.apply({ kind: 'copy', id, parentId, newId: newId_, weight: weight ?? this.nextWeight(parentId), name });
    return newId_;
  }

  setCompleted(id: string, completed: boolean): void {
    this.apply({ kind: completed ? 'complete' : 'uncomplete', id });
  }

  /** Returns the new reminder id. */
  addReminder(nodeId: string, name: string, deadline: number, repeat?: number): string {
    const rmdId = newId();
    this.apply({ kind: 'add_reminder', nodeId, rmdId, name, deadline, repeat });
    return rmdId;
  }

  removeReminder(rmdId: string): void {
    this.apply({ kind: 'remove_reminder', rmdId });
  }

  editReminder(rmdId: string, patch: { name?: string; deadline?: number; repeat?: number | null; active?: boolean }): void {
    this.apply({ kind: 'edit_reminder', rmdId, ...patch });
  }

  /** Change a node's ordering weight in place (keeps its parent). */
  setWeight(id: string, weight: number): void {
    const found = findNodeWithParent(this.getTree(), id);
    if (!found) throw new Error(`unknown node id: ${id}`);
    this.apply({ kind: 'move', id, parentId: found.parent.id, weight });
  }

  /** Set or clear the node's note (empty string clears it). */
  setNote(id: string, note: string): void {
    this.apply({ kind: 'edit_node', id, note });
  }

  /** Set the node's deadline; null clears it. */
  setDeadline(id: string, deadline: Timestamp | null): void {
    this.apply({ kind: 'edit_node', id, deadline });
  }

  private nextWeight(parentId: string): number {
    const parent = parentId === ROOT_ID ? this.getTree() : findNode(this.getTree(), parentId);
    if (!parent) throw new Error(`unknown parent id: ${parentId}`);
    return parent.children.reduce((max, c) => Math.max(max, c.weight), 0) + 1;
  }

  /** Local pre-check mirroring the core Tree rules, for clear synchronous errors.
   *  The server remains authoritative for cross-client conflicts. */
  private validateName(name: string): void {
    if (name === '') throw new Error('node name must not be empty');
    if (name.includes('/')) throw new Error(`node name must not contain "/": ${name}`);
  }

  private ensureUniqueSiblingName(parent: Node, name: string, excludeId?: string): void {
    if (parent.children.some((c) => c.id !== excludeId && c.name === name)) {
      throw new Error(`a sibling named "${name}" already exists under "${parent.id === ROOT_ID ? '/' : parent.name}"`);
    }
  }

  /** First free name of the form `base (copy)`, `base (copy 2)`, ... */
  private uniqueCopyName(parent: Node, name: string): string {
    const exists = (n: string) => parent.children.some((c) => c.name === n);
    if (!exists(name)) return name;
    const base = /^(.*?)(?: \(copy(?: \d+)?\))?$/.exec(name)?.[1] ?? name;
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? `${base} (copy)` : `${base} (copy ${n})`;
      if (!exists(candidate)) return candidate;
    }
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
    if (this.local) return 'ok';
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

  /**
   * The automatic resync: catch up, flush pending, catch up again.
   * Runs on connect/reconnect, when the server comes back online, and
   * after every local edit while online. Manual sync() forces the same.
   */
  private async resync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      await this.syncer.sync();
      this.conflict = this.syncer.getConflict();
      this.setOnline(true);
    } catch {
      // Still unreachable; the socket keeps retrying.
    } finally {
      this.syncing = false;
    }
    this.emit();
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
  url.pathname = '/api/websocket';
  return url.toString();
}

/** Append the user identity to a WS URL, preserving existing query params. */
function withUserParam(wsUrl: string, user: string): string {
  const url = new URL(wsUrl);
  url.searchParams.set('user', user);
  return url.toString();
}

function countNodes(node: Node): number {
  return node.children.reduce((sum, child) => sum + countNodes(child), node.id === ROOT_ID ? 0 : 1);
}

function countReminders(node: Node): number {
  return node.reminders.length + node.children.reduce((sum, child) => sum + countReminders(child), 0);
}

function findNode(node: Node, id: string): Node | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function findNodeWithParent(node: Node, id: string): { node: Node; parent: Node } | undefined {
  for (const child of node.children) {
    if (child.id === id) return { node: child, parent: node };
    const found = findNodeWithParent(child, id);
    if (found) return found;
  }
  return undefined;
}
