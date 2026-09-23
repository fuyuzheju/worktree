import { describe, expect, it } from 'vitest';
import {
  isAuthResponse,
  isHistoryNode,
  isHistoryOperation,
  isHistoryPage,
  isRecord,
  isServerMessage,
  isServerState,
} from '../src/index';

// These guards shape-check untrusted JSON (network bodies, persisted storage).
// They verify field types only — op semantics are replay's job — so the tests
// pin exactly where the looseness ends. isHistoryNode/isHistoryOperation back
// `isSavedState` (client storage restore); isHistoryPage and isServerMessage
// guard the API page and websocket payloads.

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, undefined, arrays and primitives', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(1)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it('accepts any non-array object, Date included', () => {
    expect(isRecord(new Date())).toBe(true);
  });
});

describe('isHistoryNode', () => {
  it('accepts an entry with a string id and a record op', () => {
    expect(isHistoryNode({ id: 'h1', op: { kind: 'add' } })).toBe(true);
  });

  it('rejects non-records, a missing/non-string id, a missing/non-record op', () => {
    expect(isHistoryNode(null)).toBe(false);
    expect(isHistoryNode('h1')).toBe(false);
    expect(isHistoryNode({})).toBe(false);
    expect(isHistoryNode({ id: 1, op: {} })).toBe(false);
    expect(isHistoryNode({ id: 'h1' })).toBe(false);
    expect(isHistoryNode({ id: 'h1', op: 'add' })).toBe(false);
  });

  it('accepts a nonsense op — a shape check, not a schema check', () => {
    expect(isHistoryNode({ id: 'h1', op: { kind: 'nope' } })).toBe(true);
  });
});

describe('isHistoryPage', () => {
  it('accepts an empty page and a delta page', () => {
    expect(isHistoryPage({ cursorFound: true, nodes: [] })).toBe(true);
    expect(isHistoryPage({ cursorFound: false, nodes: [{ id: 'h1', op: {} }] })).toBe(true);
  });

  it('rejects a non-boolean cursorFound, a non-array nodes and non-records', () => {
    expect(isHistoryPage({ cursorFound: 'true', nodes: [] })).toBe(false);
    expect(isHistoryPage({ cursorFound: true, nodes: 'nope' })).toBe(false);
    expect(isHistoryPage({ nodes: [] })).toBe(false);
    expect(isHistoryPage(null)).toBe(false);
  });

  it('rejects a nodes array containing a non-entry', () => {
    expect(isHistoryPage({ cursorFound: true, nodes: [{ id: 'h1', op: {} }, 7] })).toBe(false);
  });
});

describe('isAuthResponse', () => {
  it('accepts the register/login success body, extra fields included', () => {
    expect(isAuthResponse({ username: 'alice', token: 't', tokenId: 1 })).toBe(true);
    expect(isAuthResponse({ username: 'alice', token: 't', tokenId: 1, extra: true })).toBe(true);
  });

  it('rejects missing or wrong-typed fields', () => {
    expect(isAuthResponse({ username: 'alice', token: 't', tokenId: '1' })).toBe(false);
    expect(isAuthResponse({ username: 'alice', token: 't' })).toBe(false);
    expect(isAuthResponse({ username: 'alice', tokenId: 1 })).toBe(false);
    expect(isAuthResponse({ error: 'nope' })).toBe(false);
  });
});

describe('isServerState', () => {
  it('accepts only working and offline', () => {
    expect(isServerState('working')).toBe(true);
    expect(isServerState('offline')).toBe(true);
    expect(isServerState('idle')).toBe(false);
    expect(isServerState(0)).toBe(false);
    expect(isServerState(null)).toBe(false);
  });
});

describe('isServerMessage', () => {
  it('accepts every variant the server broadcasts', () => {
    expect(isServerMessage({ type: 'op', node: { id: 'h1', op: {} } })).toBe(true);
    expect(isServerMessage({ type: 'removed', id: 'h1' })).toBe(true);
    expect(isServerMessage({ type: 'history-replaced' })).toBe(true);
    expect(isServerMessage({ type: 'state', state: 'offline' })).toBe(true);
  });

  it('rejects an unknown type, a missing type and malformed payloads', () => {
    expect(isServerMessage({ type: 'nope' })).toBe(false);
    expect(isServerMessage({})).toBe(false);
    expect(isServerMessage('op')).toBe(false);
    expect(isServerMessage({ type: 'op', node: 'h1' })).toBe(false);
    expect(isServerMessage({ type: 'removed', id: 1 })).toBe(false);
    expect(isServerMessage({ type: 'state', state: 'busy' })).toBe(false);
  });

  it('accepts history-replaced with junk alongside (type-only variant)', () => {
    expect(isServerMessage({ type: 'history-replaced', junk: 1 })).toBe(true);
  });
});

describe('isHistoryOperation', () => {
  it('accepts an add carrying a record op, and a remove', () => {
    expect(isHistoryOperation({ kind: 'add', id: 'h1', op: { kind: 'add' } })).toBe(true);
    expect(isHistoryOperation({ kind: 'remove', id: 'h1' })).toBe(true);
  });

  it('rejects a missing or non-string id', () => {
    expect(isHistoryOperation({ kind: 'remove' })).toBe(false);
    expect(isHistoryOperation({ kind: 'remove', id: 1 })).toBe(false);
  });

  it('rejects an add without a record op', () => {
    expect(isHistoryOperation({ kind: 'add', id: 'h1' })).toBe(false);
    expect(isHistoryOperation({ kind: 'add', id: 'h1', op: 'nope' })).toBe(false);
  });

  it('rejects a HistoryNode-shaped object (no top-level kind)', () => {
    expect(isHistoryOperation({ id: 'h1', op: { kind: 'add' } })).toBe(false);
  });

  it('rejects any other kind — the pending queue only ever holds add/remove', () => {
    expect(isHistoryOperation({ kind: 'complete', id: 'h1' })).toBe(false);
  });
});
