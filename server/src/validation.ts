import { Tree } from '@worktree/core';
import type { HistoryOperation } from '@worktree/core';

export type ValidationResult = { ok: true } | { ok: false; opId: string; reason: string };

/**
 * Every op must be applicable to the tree as it stands after the preceding
 * ops of the batch. `remove` is not checked here — it is validated against
 * the head in HistoryStore.appendBatch.
 */
export function validateOps(ops: HistoryOperation[], tree: Tree): ValidationResult {
  const probe = tree.clone();
  for (const op of ops) {
    if (op.kind === 'remove') continue;
    try {
      probe.apply(op.op);
    } catch (e) {
      return { ok: false, opId: op.id, reason: e instanceof Error ? e.message : String(e) };
    }
  }
  return { ok: true };
}
