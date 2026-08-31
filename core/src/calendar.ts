import type { Block, CalendarOperation, Timestamp } from './types';

/** The calendar: blocks derived by replaying CalendarOperations in order. */
export class Calendar {
  private blocks = new Map<string, Block>();

  /** Deep, state-equivalent copy (used by validation probes). */
  clone(): Calendar {
    const copy = new Calendar();
    for (const [id, b] of this.blocks) copy.blocks.set(id, { ...b });
    return copy;
  }

  apply(op: CalendarOperation): void {
    switch (op.kind) {
      case 'add_block': {
        if (this.blocks.has(op.id)) throw new Error(`duplicate block id: ${op.id}`);
        this.validateName(op.name);
        this.validatePeriod(op.start, op.end);
        if (op.nodeId !== undefined) this.ensureNodeUnlinked(op.nodeId);
        this.blocks.set(op.id, {
          id: op.id,
          name: op.name,
          start: op.start,
          end: op.end,
          note: op.note ?? '',
          status: false,
          nodeId: op.nodeId,
        });
        break;
      }
      case 'remove_block':
        // Idempotent, so concurrent removes commute.
        this.blocks.delete(op.id);
        break;
      case 'edit_block': {
        if (
          op.name === undefined &&
          op.start === undefined &&
          op.end === undefined &&
          op.note === undefined &&
          op.nodeId === undefined
        ) {
          throw new Error('edit_block patch is empty');
        }
        const block = this.mustGet(op.id);
        if (op.name !== undefined) this.validateName(op.name);
        this.validatePeriod(op.start ?? block.start, op.end ?? block.end);
        if (op.nodeId !== undefined && op.nodeId !== null) this.ensureNodeUnlinked(op.nodeId, op.id);
        if (op.name !== undefined) block.name = op.name;
        if (op.start !== undefined) block.start = op.start;
        if (op.end !== undefined) block.end = op.end;
        if (op.note !== undefined) block.note = op.note;
        if (op.nodeId !== undefined) block.nodeId = op.nodeId ?? undefined;
        break;
      }
      case 'complete_block':
        this.mustGet(op.id).status = true;
        break;
      case 'uncomplete_block':
        this.mustGet(op.id).status = false;
        break;
    }
  }

  getBlocks(): Block[] {
    return [...this.blocks.values()];
  }

  blockCount(): number {
    return this.blocks.size;
  }

  /** Derived status change (completion propagation). */
  setStatus(id: string, status: boolean): void {
    this.mustGet(id).status = status;
  }

  /** Derived status change: every block linked to `nodeId` (at most one exists). */
  setStatusForNode(nodeId: string, status: boolean): void {
    for (const b of this.blocks.values()) {
      if (b.nodeId === nodeId) b.status = status;
    }
  }

  /** Derived link cleanup: blocks whose node no longer exists become standalone. */
  unlinkMissingNodes(exists: (nodeId: string) => boolean): void {
    for (const b of this.blocks.values()) {
      if (b.nodeId !== undefined && !exists(b.nodeId)) b.nodeId = undefined;
    }
  }

  private mustGet(id: string): Block {
    const block = this.blocks.get(id);
    if (!block) throw new Error(`unknown block id: ${id}`);
    return block;
  }

  private validateName(name: string): void {
    if (name === '') throw new Error('block name must not be empty');
  }

  private validatePeriod(start: Timestamp, end: Timestamp): void {
    if (start >= end) throw new Error(`block start must be before end: ${start} >= ${end}`);
  }

  /** At most one block may link a node; `excludeId` exempts the block itself (edit relink). */
  private ensureNodeUnlinked(nodeId: string, excludeId?: string): void {
    for (const b of this.blocks.values()) {
      if (b.id !== excludeId && b.nodeId === nodeId) {
        throw new Error(`node already linked to a block: ${nodeId}`);
      }
    }
  }
}
