import { HistoryChain, PendingQueue, Tree, newId } from '@worktree/core';
import type { HistoryNode, HistoryOperation, Node, TreeOperation } from '@worktree/core';
import type { SavedState } from './storage';

/** Client-side state: confirmed history + pending queue, rendered as a tree. */
export class ClientStore {
  private confirmed = new HistoryChain();
  private pending = new PendingQueue();
  private tree = new Tree();

  constructor(private persist?: (state: SavedState) => void) {}

  /** Restore persisted state: replace the confirmed chain, refill the pending queue. */
  restore(confirmed: HistoryNode[], pending: HistoryOperation[]): void {
    this.confirmed.replace(confirmed);
    this.pending.clear();
    for (const p of pending) this.pending.enqueue(p);
    this.rebuild();
  }

  getTree(): Node {
    return this.tree.getRoot();
  }

  getConfirmed(): HistoryNode[] {
    return this.confirmed.toArray();
  }

  getPending(): HistoryOperation[] {
    return this.pending.getAll();
  }

  /** Local optimistic edit: wrap in a history op and queue it. */
  applyLocal(op: TreeOperation): void {
    const id = newId();
    this.pending.enqueue({ kind: 'add', id, op });
    this.rebuild();
  }

  /** Offline-only edit (local user): go straight into the confirmed chain. */
  applyLocalConfirmed(op: TreeOperation): void {
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
      if (p.kind !== 'add') throw new Error(`history operation '${p.kind}' is not supported`);
      this.confirmed.append(p.id, p.op);
    }
    this.pending.clear();
    this.rebuild();
  }

  private rebuild(): void {
    const tree = new Tree();
    for (const n of this.confirmed.toArray()) tree.apply(n.op);
    for (const p of this.pending.getAll()) {
      if (p.kind !== 'add') continue;
      try {
        tree.apply(p.op);
      } catch {
        // Pending op no longer applies to the confirmed state (conflict):
        // render without it until the conflict is resolved.
      }
    }
    this.tree = tree;
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
