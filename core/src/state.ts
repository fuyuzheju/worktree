import type { HistoryNode, Operation } from './types';
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
        this.syncChanged(this.tree.apply(op));
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
          this.syncChanged(this.tree.setNodeStatus(block.nodeId, block.status, op.timestamp));
        }
        return;
      }
      case 'remove_block':
      case 'add_block_rule':
      case 'edit_block_rule':
      case 'remove_block_rule':
      case 'skip_occurrence':
      case 'unskip_occurrence':
        this.calendar.apply(op);
        return;
      default:
        this.syncChanged(this.tree.apply(op));
    }
  }

  /** Keeps the invariant: every linked block's status equals its node's status,
   *  including nodes the derived cascade (un)completed. */
  private syncChanged(changed: string[]): void {
    for (const id of changed) {
      const node = this.tree.getNode(id);
      if (node !== undefined) this.calendar.setStatusForNode(id, node.status);
    }
  }
}

/**
 * A stored history entry that no longer applies under the current rules (e.g.
 * a `complete` op appended before the children-first rule existed). Replay is
 * allowed to fail on such entries: callers abort the replay, surface the entry
 * to the user, and offer a repair (see planDropRepair).
 */
export class HistoryReplayError extends Error {
  constructor(
    public entryId: string,
    public index: number,
    public op: Operation,
    reason: string,
  ) {
    super(reason);
  }
}

/**
 * Replays a stored history, identifying the entry that fails. Used wherever
 * the ops come from storage (client cache, server boot, repair) rather than
 * from a live edit whose submit path reports its own errors.
 */
export function replayHistory(nodes: HistoryNode[]): WorktreeState {
  const state = new WorktreeState();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    try {
      state.apply(node.op);
    } catch (e) {
      throw new HistoryReplayError(node.id, i, node.op, e instanceof Error ? e.message : String(e));
    }
  }
  return state;
}
