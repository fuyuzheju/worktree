import { WorktreeState } from './state';
import { civilFromDays, formatCivilDate } from './civil';
import type { HistoryNode, Operation } from './types';

/** An entry a repair drops, with a description of what it targeted. */
export interface RepairDrop {
  entry: HistoryNode;
  /** Why the entry no longer applies (the apply error message). */
  reason: string;
  /** Human-readable target of the op, e.g. `complete "Groceries"`. */
  description: string;
}

export interface RepairPlan {
  /** The history with every entry that failed replay removed. */
  repaired: HistoryNode[];
  /** The removed entries, in history order. */
  dropped: RepairDrop[];
}

/**
 * Simulates replay and drops every entry that no longer applies, so the result
 * replays cleanly on every replica. Dropping an entry can invalidate later
 * ones that depended on it (ops on a node whose `add` was dropped) — those are
 * reported too, so the caller can show the full extent before applying.
 */
export function planDropRepair(nodes: HistoryNode[]): RepairPlan {
  const state = new WorktreeState();
  const repaired: HistoryNode[] = [];
  const dropped: RepairDrop[] = [];
  for (const node of nodes) {
    try {
      state.apply(node.op);
    } catch (e) {
      dropped.push({
        entry: node,
        reason: e instanceof Error ? e.message : String(e),
        description: describe(state, node.op),
      });
      continue;
    }
    repaired.push(node);
  }
  return { repaired, dropped };
}

/** Names the op's target from the state as it stands before the op. */
function describe(state: WorktreeState, op: Operation): string {
  switch (op.kind) {
    case 'add':
      return `add "${op.name}"`;
    case 'add_block':
      return `add_block "${op.name}"`;
    case 'complete_block':
    case 'uncomplete_block':
    case 'edit_block':
    case 'remove_block': {
      const block = state.calendar.getBlocks().find((b) => b.id === op.id);
      return block === undefined ? `${op.kind} ${op.id}` : `${op.kind} "${block.name}"`;
    }
    case 'add_reminder': {
      const node = state.tree.getNode(op.nodeId);
      return node === undefined ? `add_reminder ${op.rmdId}` : `add_reminder on "${node.name}"`;
    }
    case 'remove_reminder':
    case 'edit_reminder':
      return `${op.kind} ${op.rmdId}`;
    case 'add_block_rule':
      return `add_block_rule "${op.name}"`;
    case 'edit_block_rule':
    case 'remove_block_rule': {
      const rule = state.calendar.getRules().find((r) => r.id === op.id);
      return rule === undefined ? `${op.kind} ${op.id}` : `${op.kind} "${rule.name}"`;
    }
    case 'skip_occurrence':
    case 'unskip_occurrence': {
      const rule = state.calendar.getRules().find((r) => r.id === op.ruleId);
      const date = formatCivilDate(civilFromDays(op.day));
      return rule === undefined ? `${op.kind} ${op.ruleId} ${date}` : `${op.kind} "${rule.name}" ${date}`;
    }
    case 'remove':
      return `undo ${op.id}`;
    default: {
      const node = state.tree.getNode(op.id);
      return node === undefined ? `${op.kind} ${op.id}` : `${op.kind} "${node.name}"`;
    }
  }
}
