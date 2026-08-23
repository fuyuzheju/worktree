import type { HistoryNode, HistoryOperation } from '@worktree/core';
import { shortId } from './render';

/** One-line summary of a history op, like the CLI conflict listing. */
export function formatHistoryOp(h: HistoryOperation): string {
  const kind = h.kind === 'remove' ? 'remove' : h.op.kind;
  return `${shortId(h.id)} ${kind}`;
}

export function formatHistoryNode(n: HistoryNode): string {
  return `${shortId(n.id)} ${n.op.kind}`;
}
