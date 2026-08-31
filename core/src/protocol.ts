import type { HistoryNode, HistoryOperation, ServerState } from './types';

/** POST /submit request body. */
export interface SubmitRequest {
  htrop: HistoryOperation[];
}

/** POST /register request body. `inviteCode` is ignored while registration
 * is open; reserved for the future invite-code mode. */
export interface RegisterRequest {
  username: string;
  password: string;
  inviteCode?: string;
}

/** POST /login request body. `label` names this device for token management. */
export interface LoginRequest {
  username: string;
  password: string;
  label?: string;
}

/** Success body shared by /register and /login. The raw token is returned
 * exactly once; the server only stores its hash. */
export interface AuthResponse {
  username: string;
  token: string;
  tokenId: number;
}

/** GET /tokens response body. `current` marks the token making the request. */
export interface TokensResponse {
  tokens: Array<{
    id: number;
    label: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    current: boolean;
  }>;
}

/** GET /stats response body. */
export interface Stats {
  opCount: number;
  nodeCount: number;
  reminderCount: number;
  blockCount: number;
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
