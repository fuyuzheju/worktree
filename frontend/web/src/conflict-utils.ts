import { Tree } from '@worktree/core';
import type { HistoryNode, HistoryOperation } from '@worktree/core';
import { shortId } from './render';

/**
 * Greedily keep the pending ops that still replay cleanly on top of the
 * server history — the ops that conflict are dropped. The kept list is safe
 * to pass to resolveConflict('local', chosenOps): it replays by construction.
 */
export function filterReplayable(
  serverHistory: HistoryNode[],
  pending: HistoryOperation[],
): HistoryOperation[] {
  const tree = Tree.fromOps(serverHistory.map((n) => n.op));
  const keep: HistoryOperation[] = [];
  for (const p of pending) {
    if (p.kind !== 'add') continue;
    try {
      tree.apply(p.op);
      keep.push(p);
    } catch {
      // Conflicts with the merged history — dropped.
    }
  }
  return keep;
}

/** One-line summary of a history op, like the CLI conflict listing. */
export function formatHistoryOp(h: HistoryOperation): string {
  const kind = h.kind === 'remove' ? 'remove' : h.op.kind;
  return `${shortId(h.id)} ${kind}`;
}

export function formatHistoryNode(n: HistoryNode): string {
  return `${shortId(n.id)} ${n.op.kind}`;
}
