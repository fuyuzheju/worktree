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
