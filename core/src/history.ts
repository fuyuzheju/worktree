import type { HistoryNode, Operation } from './types';

/**
 * Append-ordered chain of confirmed operations. `since` returns the entries
 * after a cursor for catch-up; an unknown cursor yields the whole chain.
 */
export class HistoryChain {
  private nodes = new Map<string, HistoryNode>();
  private order: string[] = [];

  append(id: string, op: Operation): HistoryNode {
    if (this.nodes.has(id)) throw new Error(`history node ${id} already exists`);
    const node: HistoryNode = { id, op };
    this.nodes.set(id, node);
    this.order.push(id);
    return node;
  }

  get(id: string): HistoryNode | undefined {
    return this.nodes.get(id);
  }

  getHead(): HistoryNode | undefined {
    const headId = this.order.at(-1);
    return headId === undefined ? undefined : this.nodes.get(headId);
  }

  get length(): number {
    return this.order.length;
  }

  /** Nodes after (exclusive) `cursorId`; null or unknown cursor returns the whole chain. */
  since(cursorId: string | null): HistoryNode[] {
    if (cursorId === null) return this.toArray();
    const idx = this.order.indexOf(cursorId);
    if (idx === -1) return this.toArray();
    return this.order.slice(idx + 1).map((id) => this.nodes.get(id)!);
  }

  /** Undo: remove the head entry. Only the head may be removed. */
  remove(id: string): void {
    if (this.order.at(-1) !== id) throw new Error(`can only remove the head, got ${id}`);
    this.order.pop();
    this.nodes.delete(id);
  }

  /** Replace the whole history; head becomes the last node of the array. */
  replace(nodes: HistoryNode[]): void {
    this.nodes.clear();
    this.order = [];
    for (const n of nodes) {
      this.nodes.set(n.id, n);
      this.order.push(n.id);
    }
  }

  toArray(): HistoryNode[] {
    return this.order.map((id) => this.nodes.get(id)!);
  }
}
