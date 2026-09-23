import { WorktreeState, operationSchema } from '@worktree/core';
import type { HistoryNode, HistoryOperation } from '@worktree/core';

export type ValidationResult = { ok: true } | { ok: false; opId: string; reason: string };

/**
 * Ops must satisfy the storage schema (core's operationSchema) before they are
 * persisted: the server reads every entry back through it, so one op that
 * fails here would make the whole stored history unreadable — including at
 * boot. Cheaper to reject it at the door.
 *
 * Entry ids must be unique too: `historyNode` rows are keyed by (user, op id),
 * so a repeated id could never be stored — without this check the write would
 * fail as a raw unique-constraint violation instead of a validation error.
 */
export function validateOpShape(entries: HistoryNode[]): ValidationResult {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      return { ok: false, opId: entry.id, reason: `duplicate history entry id: ${entry.id}` };
    }
    seen.add(entry.id);
    const parsed = operationSchema.safeParse(entry.op);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'op'}: ${i.message}`).join('; ');
      return { ok: false, opId: entry.id, reason: `does not match the op schema — ${issues}` };
    }
  }
  return { ok: true };
}

/**
 * Entry ids identify the row a request writes or undoes, so they must be
 * usable as keys before any of them reaches the database: a missing or
 * non-string id would fail as a Prisma validation error (500) instead of a
 * 400. The parameter is typed `{id: string}` because that is what callers
 * claim — the values come from request JSON, hence the runtime check.
 *
 * Uniqueness is not checked here: `remove` (undo) ops may legitimately repeat
 * an id within a batch (idempotent retry, concurrent undos of the same head).
 * Whole-payload uniqueness is `validateOpShape`'s job.
 */
export function validateOpIds(items: Array<{ id: string }>): ValidationResult {
  for (const item of items) {
    if (typeof item.id !== 'string' || item.id === '') {
      return { ok: false, opId: String(item.id), reason: 'history op id must be a non-empty string' };
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
