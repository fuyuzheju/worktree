import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import type { HistoryNode, HistoryOperation } from '@worktree/core';
import { filterReplayable, formatHistoryOp } from '../src/conflict-utils';

const serverHistory: HistoryNode[] = [
  { id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } },
  { id: 'op2', op: { kind: 'add', parentId: 'aaaa-1', id: 'kkkk-1', name: 'k', weight: 1 } },
];

describe('filterReplayable', () => {
  it('keeps pending ops that replay and drops the ones that conflict', () => {
    const pending: HistoryOperation[] = [
      // Conflicting: sibling name collision with the server's k.
      { kind: 'add', id: 'p1', op: { kind: 'add', parentId: 'aaaa-1', id: 'kkkk-2', name: 'k', weight: 2 } },
      // Non-conflicting: fresh node under alpha.
      { kind: 'add', id: 'p2', op: { kind: 'add', parentId: 'aaaa-1', id: 'mmmm-1', name: 'm', weight: 3 } },
      // Conflicting: target was removed on the server.
      { kind: 'add', id: 'p3', op: { kind: 'rename', id: 'zzzz-1', name: 'z2' } },
    ];
    expect(filterReplayable(serverHistory, pending)).toEqual([pending[1]]);
  });

  it('returns an empty list when nothing replays', () => {
    const pending: HistoryOperation[] = [
      { kind: 'add', id: 'p1', op: { kind: 'rename', id: 'zzzz-1', name: 'z2' } },
    ];
    expect(filterReplayable(serverHistory, pending)).toEqual([]);
  });

  it('keeps ops in order so dependencies replay', () => {
    const pending: HistoryOperation[] = [
      { kind: 'add', id: 'p1', op: { kind: 'add', parentId: ROOT_ID, id: 'zzzz-1', name: 'z', weight: 9 } },
      { kind: 'add', id: 'p2', op: { kind: 'add', parentId: 'zzzz-1', id: 'zzzz-2', name: 'z-child', weight: 1 } },
    ];
    expect(filterReplayable(serverHistory, pending)).toEqual(pending);
  });
});

describe('formatHistoryOp', () => {
  it('formats add and remove ops like the CLI conflict listing', () => {
    expect(
      formatHistoryOp({ kind: 'add', id: 'abcd-1234', op: { kind: 'rename', id: 'x', name: 'y' } }),
    ).toBe('abcd rename');
    expect(formatHistoryOp({ kind: 'remove', id: 'abcd-1234' })).toBe('abcd remove');
  });
});
