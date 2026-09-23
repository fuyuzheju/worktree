import { describe, expect, it } from 'vitest';
import { isSavedState } from '../src/storage';

const entry = { id: 'h1', op: { kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: 1 } };
const pending = { kind: 'add', id: 'h2', op: { kind: 'rename', id: 'a', name: 'A2' } };

describe('isSavedState', () => {
  it('accepts a well-formed saved state', () => {
    expect(isSavedState({ confirmed: [entry], pending: [pending] })).toBe(true);
    expect(isSavedState({ confirmed: [], pending: [] })).toBe(true);
  });

  it('rejects non-records and non-array fields', () => {
    expect(isSavedState(null)).toBe(false);
    expect(isSavedState({})).toBe(false);
    expect(isSavedState({ confirmed: 'nope', pending: [] })).toBe(false);
    expect(isSavedState({ confirmed: [], pending: 'nope' })).toBe(false);
  });

  it('rejects malformed confirmed elements', () => {
    expect(isSavedState({ confirmed: [{ id: 'h1' }], pending: [] })).toBe(false);
    expect(isSavedState({ confirmed: [7], pending: [] })).toBe(false);
  });

  it('rejects a confirmed chain with a repeated entry id', () => {
    // The elements are well-formed; the chain itself is corrupt.
    expect(isSavedState({ confirmed: [entry, { ...entry }], pending: [] })).toBe(false);
  });

  it('rejects malformed pending elements, a HistoryNode shape included', () => {
    expect(isSavedState({ confirmed: [], pending: [{ id: 'h1' }] })).toBe(false);
    expect(isSavedState({ confirmed: [], pending: [{ id: 'h1', op: {} }] })).toBe(false);
    expect(isSavedState({ confirmed: [], pending: [{ kind: 'complete', id: 'h1' }] })).toBe(false);
  });
});
