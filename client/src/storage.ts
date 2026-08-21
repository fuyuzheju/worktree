import type { HistoryNode, HistoryOperation } from '@worktree/core';

/** Everything the client persists locally, so offline edits and history survive restarts. */
export interface SavedState {
  confirmed: HistoryNode[];
  pending: HistoryOperation[];
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
