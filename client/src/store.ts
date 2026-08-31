import { HistoryChain, PendingQueue, WorktreeState, newId } from '@worktree/core';
import type { Block, HistoryNode, HistoryOperation, Node, Operation } from '@worktree/core';
import type { SavedState } from './storage';

/** Client-side state: confirmed history + pending queue, rendered as a tree and calendar. */
export class ClientStore {
  private confirmed = new HistoryChain();
  private pending = new PendingQueue();
  private state = new WorktreeState();

  constructor(private persist?: (state: SavedState) => void) {}

  /** Restore persisted state: replace the confirmed chain, refill the pending queue. */
  restore(confirmed: HistoryNode[], pending: HistoryOperation[]): void {
    this.confirmed.replace(confirmed);
    this.pending.clear();
    for (const p of pending) this.pending.enqueue(p);
    this.rebuild();
  }

  getTree(): Node {
    return this.state.tree.getRoot();
  }

  getBlocks(): Block[] {
    return this.state.calendar.getBlocks();
  }

  getConfirmed(): HistoryNode[] {
    return this.confirmed.toArray();
  }

  getPending(): HistoryOperation[] {
    return this.pending.getAll();
  }

  /** Local optimistic edit: wrap in a history op and queue it. */
  applyLocal(op: Operation): void {
    const id = newId();
    this.pending.enqueue({ kind: 'add', id, op });
    this.rebuild();
  }

  /** Undo the newest unconfirmed local edit. Returns false when there is none. */
  undoPendingAdd(): boolean {
    const popped = this.pending.popLastAdd();
    if (!popped) return false;
    this.rebuild();
    return true;
  }

  /**
   * Queue an undo of the newest confirmed entry that no pending undo targets
   * yet (the server deletes that history entry). Only call when the queue
   * holds no adds. Returns false when the confirmed chain is exhausted.
   */
  applyUndo(): boolean {
    const pendingRemoves = this.pending.getAll().filter((p) => p.kind === 'remove').length;
    const confirmed = this.confirmed.toArray();
    const target = confirmed[confirmed.length - 1 - pendingRemoves];
    if (!target) return false;
    this.pending.enqueue({ kind: 'remove', id: target.id });
    this.rebuild();
    return true;
  }

  /** Offline-only edit (local user): go straight into the confirmed chain. */
  applyLocalConfirmed(op: Operation): void {
    this.confirmed.append(newId(), op);
    this.rebuild();
  }

  /** A server-confirmed history node (from catch-up or broadcast). */
  applyConfirmed(node: HistoryNode): void {
    if (this.confirmed.get(node.id)) return;
    this.pending.confirm(node.id);
    this.confirmed.append(node.id, node.op);
    this.rebuild();
  }

  /** The server undid its head entry. */
  applyRemoved(id: string): void {
    if (this.confirmed.getHead()?.id !== id) return;
    this.confirmed.remove(id);
    this.pending.confirm(id);
    this.rebuild();
  }

  /** Replace local confirmed history with the server's. */
  setConfirmed(nodes: HistoryNode[]): void {
    this.confirmed.replace(nodes);
    this.rebuild();
  }

  clearPending(): void {
    this.pending.clear();
    this.rebuild();
  }

  /** The server accepted the pending chain: move it to confirmed. */
  confirmAllPending(): void {
    for (const p of this.pending.getAll()) {
      if (p.kind === 'add') {
        this.confirmed.append(p.id, p.op);
      } else if (this.confirmed.getHead()?.id === p.id) {
        this.confirmed.remove(p.id);
      }
    }
    this.pending.clear();
    this.rebuild();
  }

  private rebuild(): void {
    const confirmed = this.confirmed.toArray();
    const pending = this.pending.getAll();
    // Each pending undo drops the confirmed head it targets (mirroring the
    // server rule: only the head may be undone); stale ones are left for
    // the server to reject.
    for (const p of pending) {
      if (p.kind !== 'remove') continue;
      if (confirmed.at(-1)?.id === p.id) confirmed.pop();
    }
    const state = WorktreeState.fromOps(confirmed.map((n) => n.op));
    for (const p of pending) {
      if (p.kind !== 'add') continue;
      try {
        state.apply(p.op);
      } catch {
        // Pending op no longer applies to the confirmed state (conflict):
        // render without it until the conflict is resolved.
      }
    }
    this.state = state;
    if (this.persist) {
      try {
        this.persist({ confirmed: this.confirmed.toArray(), pending: this.pending.getAll() });
      } catch (e) {
        // Storage failures must never break the app.
        console.error('persist failed:', e);
      }
    }
  }
}
