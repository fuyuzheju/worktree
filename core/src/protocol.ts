import type { HistoryNode, HistoryOperation, ServerState } from './types';

/** POST /submit request body. */
export interface SubmitRequest {
  htrop: HistoryOperation[];
}

/** GET /stats response body. */
export interface Stats {
  opCount: number;
  nodeCount: number;
  reminderCount: number;
  state: ServerState;
}

/** POST /rewrite request body. */
export interface RewriteRequest {
  /** Id of the last history entry the client has seen; 409 when not the current head. */
  base: string | null;
  history: HistoryNode[];
}

/** 400 response body for rejected submits. */
export interface ConflictResponse {
  conflict_id: string;
  reason: string;
}

/**
 * GET /history response. `cursorFound` distinguishes a normal delta
 * (true, nodes = entries after the cursor) from a full history returned
 * because the cursor no longer exists (false — the history was rewritten).
 */
export interface HistoryPage {
  cursorFound: boolean;
  nodes: HistoryNode[];
}

/** Messages broadcast over /websocket. */
export type ServerMessage =
  | { type: 'op'; node: HistoryNode }
  | { type: 'removed'; id: string }
  | { type: 'history-replaced' }
  | { type: 'state'; state: ServerState };
