import { isHistoryNode, isHistoryOperation, isRecord } from '@worktree/core';
import type { HistoryNode, HistoryOperation } from '@worktree/core';

/** Everything the client persists locally, so offline edits and history survive restarts. */
export interface SavedState {
  confirmed: HistoryNode[];
  pending: HistoryOperation[];
}

/**
 * Shape check for a persisted SavedState. Storage is untrusted input (a
 * hand-edited or half-written file), and a malformed entry that slipped
 * through would corrupt the replayed history — implementations use this to
 * treat such state as absent instead.
 */
export function isSavedState(v: unknown): v is SavedState {
  if (!isRecord(v)) return false;
  if (!Array.isArray(v.confirmed) || !v.confirmed.every(isHistoryNode)) return false;
  if (!Array.isArray(v.pending) || !v.pending.every(isHistoryOperation)) return false;
  // A chain with a repeated entry id is corrupt by construction — HistoryChain
  // refuses one. Catch it here so restore() cannot throw on stored state.
  return new Set(v.confirmed.map((n) => n.id)).size === v.confirmed.length;
}

/**
 * Platform storage for SavedState. The CLI backs this with a file; a web
 * frontend would back it with localStorage/IndexedDB. Implementations are
 * namespaced per (server, user) by whoever constructs them.
 */
export interface ClientStorage {
  /** The saved state, or null when there is none (or it is unreadable). */
  load(): SavedState | null;
  save(state: SavedState): void;
}
