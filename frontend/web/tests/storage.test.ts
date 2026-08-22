import { beforeEach, describe, expect, it } from 'vitest';
import type { SavedState } from '@worktree/client';
import { LocalStorageClientStorage } from '../src/storage';

const KEY = 'worktree.state.test';

beforeEach(() => {
  localStorage.clear();
});

describe('LocalStorageClientStorage', () => {
  it('roundtrips saved state', () => {
    const storage = new LocalStorageClientStorage(KEY);
    const state: SavedState = {
      confirmed: [{ id: 'a', op: { kind: 'rename', id: 'x', name: 'y' } }],
      pending: [],
    };
    storage.save(state);
    expect(storage.load()).toEqual(state);
  });

  it('returns null when nothing is stored', () => {
    expect(new LocalStorageClientStorage(KEY).load()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(new LocalStorageClientStorage(KEY).load()).toBeNull();
  });

  it('returns null when the shape is wrong', () => {
    localStorage.setItem(KEY, JSON.stringify({ confirmed: 'nope', pending: [] }));
    expect(new LocalStorageClientStorage(KEY).load()).toBeNull();
  });

  it('does not leak state between keys', () => {
    new LocalStorageClientStorage('worktree.state.a').save({ confirmed: [], pending: [] });
    expect(new LocalStorageClientStorage('worktree.state.b').load()).toBeNull();
  });
});
