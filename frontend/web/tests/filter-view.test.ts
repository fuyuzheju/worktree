import { describe, expect, it } from 'vitest';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import { highlightView } from '../src/filter-view';

describe('highlightView', () => {
  const tree = Tree.fromOps([
    { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'parent', weight: 1 },
    { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'child', weight: 1, note: 'target' },
    { kind: 'add', parentId: ROOT_ID, id: 'cccc-1', name: 'other', weight: 2 },
  ]).getRoot();

  it('keeps every node and flags only the matches', () => {
    const view = highlightView(tree, { keyword: 'target' });
    expect(view.children.map((c) => c.node.id)).toEqual(['aaaa-1', 'cccc-1']);
    expect(view.children[0].matched).toBe(false);
    expect(view.children[0].children[0].matched).toBe(true);
    expect(view.children[1].matched).toBe(false);
  });

  it('flags every non-root node with an empty filter', () => {
    const view = highlightView(tree, {});
    expect(view.children.every((c) => c.matched)).toBe(true);
  });
});
