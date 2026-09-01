import type { HistoryOperation } from './types';

/** FIFO queue of history operations awaiting server confirmation. */
export class PendingQueue {
  private ops: HistoryOperation[] = [];

  enqueue(op: HistoryOperation): void {
    this.ops.push(op);
  }

  dequeue(): HistoryOperation | undefined {
    return this.ops.shift();
  }

  peek(): HistoryOperation | undefined {
    return this.ops[0];
  }

  get length(): number {
    return this.ops.length;
  }

  /** Undo locally: remove and return the newest add-type op (undefined when none). */
  popLastAdd(): HistoryOperation | undefined {
    for (let i = this.ops.length - 1; i >= 0; i--) {
      if (this.ops[i].kind === 'add') return this.ops.splice(i, 1)[0];
    }
    return undefined;
  }

  getAll(): HistoryOperation[] {
    return [...this.ops];
  }

  /** Drop the op with the given history-node id (the server confirmed it). */
  confirm(id: string): void {
    this.ops = this.ops.filter((op) => op.id !== id);
  }

  clear(): void {
    this.ops = [];
  }
}
