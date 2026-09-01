import type { Operation } from './types';
import { Calendar } from './calendar';
import { Tree } from './tree';

/**
 * The per-user state: the node tree plus the calendar, derived by replaying
 * the user's Operation history in order. The tree and calendar are separate
 * domains; this class coordinates them (completion propagation, link
 * cleanup on node removal).
 *
 * Invariant: a linked block's status always equals its node's status.
 */
export class WorktreeState {
  readonly tree: Tree;
  readonly calendar: Calendar;

  constructor(tree: Tree = new Tree(), calendar: Calendar = new Calendar()) {
    this.tree = tree;
    this.calendar = calendar;
  }

  static fromOps(ops: Operation[]): WorktreeState {
    const state = new WorktreeState();
    for (const op of ops) state.apply(op);
    return state;
  }

  /** Deep, state-equivalent copy (used by server-side validation probes). */
  clone(): WorktreeState {
    return new WorktreeState(this.tree.clone(), this.calendar.clone());
  }

  apply(op: Operation): void {
    switch (op.kind) {
      case 'complete':
      case 'uncomplete': {
        this.tree.apply(op);
        this.calendar.setStatusForNode(op.id, op.kind === 'complete');
        return;
      }
      case 'remove': {
        this.tree.apply(op);
        // Blocks are kept; links to removed nodes are cleared (undo of the
        // removal restores them via history replay).
        this.calendar.unlinkMissingNodes((id) => this.tree.getNode(id) !== undefined);
        return;
      }
      case 'add_block':
      case 'edit_block': {
        const nodeId = op.kind === 'add_block' ? op.nodeId : op.nodeId ?? undefined;
        // The calendar cannot see nodes; link existence is this layer's check.
        if (nodeId !== undefined && !this.tree.getNode(nodeId)) {
          throw new Error(`unknown node id: ${nodeId}`);
        }
        this.calendar.apply(op);
        // A new or relinked block is born in sync with its node.
        if (nodeId !== undefined) {
          const node = this.tree.getNode(nodeId);
          if (node !== undefined) this.calendar.setStatus(op.id, node.status);
        }
        return;
      }
      case 'complete_block':
      case 'uncomplete_block': {
        this.calendar.apply(op);
        const block = this.calendar.getBlocks().find((b) => b.id === op.id);
        if (block === undefined) throw new Error(`unknown block id: ${op.id}`);
        if (block.nodeId !== undefined) {
          // At most one block links a node, so no sibling sync is needed.
          this.tree.setNodeStatus(block.nodeId, block.status, op.timestamp);
        }
        return;
      }
      case 'remove_block':
        this.calendar.apply(op);
        return;
      default:
        this.tree.apply(op);
    }
  }
}
