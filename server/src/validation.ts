import { WorktreeState, operationSchema } from '@worktree/core';
import type { HistoryNode, HistoryOperation } from '@worktree/core';

export type ValidationResult = { ok: true } | { ok: false; opId: string; reason: string };

/**
 * Ops must satisfy the storage schema (core's operationSchema) before they are
 * persisted: the server reads every entry back through it, so one op that
 * fails here would make the whole stored history unreadable — including at
 * boot. Cheaper to reject it at the door.
 */
export function validateOpShape(entries: HistoryNode[]): ValidationResult {
  for (const entry of entries) {
    const parsed = operationSchema.safeParse(entry.op);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'op'}: ${i.message}`).join('; ');
      return { ok: false, opId: entry.id, reason: `does not match the op schema — ${issues}` };
    }
  }
  return { ok: true };
}

/**
 * Every op must be applicable to the state (tree + calendar) as it stands
 * after the preceding ops of the batch. `remove` is not checked here — it is
 * validated against the head in HistoryStore.appendBatch.
 */
export function validateOps(ops: HistoryOperation[], state: WorktreeState): ValidationResult {
  const probe = state.clone();
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
