import type { AuthResponse, HistoryPage, ServerMessage } from './protocol';
import type { HistoryNode, HistoryOperation, ServerState } from './types';

/** Runtime guards for untrusted JSON (network bodies, localStorage, files).
 *  Ops are only shape-checked here — semantic validation happens when the
 *  kernel replays them. */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isHistoryNode(v: unknown): v is HistoryNode {
  return isRecord(v) && typeof v.id === 'string' && isRecord(v.op);
}

export function isHistoryPage(v: unknown): v is HistoryPage {
  return (
    isRecord(v) &&
    typeof v.cursorFound === 'boolean' &&
    Array.isArray(v.nodes) &&
    v.nodes.every(isHistoryNode)
  );
}

export function isAuthResponse(v: unknown): v is AuthResponse {
  return (
    isRecord(v) &&
    typeof v.username === 'string' &&
    typeof v.token === 'string' &&
    typeof v.tokenId === 'number'
  );
}

export function isServerState(v: unknown): v is ServerState {
  return v === 'working' || v === 'offline';
}

export function isServerMessage(v: unknown): v is ServerMessage {
  if (!isRecord(v)) return false;
  switch (v.type) {
    case 'op':
      return isHistoryNode(v.node);
    case 'removed':
      return typeof v.id === 'string';
    case 'history-replaced':
      return true;
    case 'state':
      return isServerState(v.state);
    default:
      return false;
  }
}

export function isHistoryOperation(v: unknown): v is HistoryOperation {
  if (!isRecord(v) || typeof v.id !== 'string') return false;
  if (v.kind === 'remove') return true;
  return v.kind === 'add' && isRecord(v.op);
}
