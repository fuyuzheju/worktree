import { describe, expect, it } from 'vitest';
import { ROOT_ID, Tree, filterTree, matchesFilter } from '../src/index';
import type { Node } from '../src/index';

const add = (
  parentId: string,
  id: string,
  fields: { name?: string; weight?: number; note?: string; deadline?: number; createdAt?: number } = {},
) =>
  ({
    kind: 'add',
    parentId,
    id,
    name: fields.name ?? id,
    weight: fields.weight ?? 1,
    note: fields.note,
    deadline: fields.deadline,
    createdAt: fields.createdAt,
  }) as const;

const NOW = 1_000_000;

describe('matchesFilter', () => {
  const tree = Tree.fromOps([
    add(ROOT_ID, 'a', { note: 'buy milk', deadline: NOW + 100, createdAt: 100 }),
    add(ROOT_ID, 'b', { note: 'write report', deadline: NOW - 100, createdAt: 200 }),
    add(ROOT_ID, 'c', { createdAt: 300 }),
  ]);
  const node = (id: string): Node => tree.getNode(id)!;

  it('an empty filter matches every non-root node', () => {
    expect(matchesFilter(node('a'), {})).toBe(true);
    expect(matchesFilter(tree.getRoot(), {})).toBe(false);
  });

  it('the root never matches', () => {
    expect(matchesFilter(tree.getRoot(), { keyword: '' })).toBe(false);
  });

  it('keyword matches name OR note, case-insensitively', () => {
    expect(matchesFilter(node('a'), { keyword: 'MILK' })).toBe(true);
    expect(matchesFilter(node('b'), { keyword: 'REPORT' })).toBe(true);
    expect(matchesFilter(node('a'), { keyword: 'a' })).toBe(true);
    expect(matchesFilter(node('c'), { keyword: 'milk' })).toBe(false);
  });

  it('nameContains and noteContains match their own field only', () => {
    expect(matchesFilter(node('a'), { nameContains: 'A' })).toBe(true);
    expect(matchesFilter(node('a'), { noteContains: 'milk' })).toBe(true);
    expect(matchesFilter(node('a'), { nameContains: 'milk' })).toBe(false);
    expect(matchesFilter(node('a'), { noteContains: 'a' })).toBe(false);
  });

  it('hasDeadline distinguishes nodes with and without a deadline', () => {
    expect(matchesFilter(node('a'), { hasDeadline: true })).toBe(true);
    expect(matchesFilter(node('c'), { hasDeadline: true })).toBe(false);
    expect(matchesFilter(node('c'), { hasDeadline: false })).toBe(true);
    expect(matchesFilter(node('a'), { hasDeadline: false })).toBe(false);
  });

  it('deadlineBefore is inclusive and requires a deadline', () => {
    expect(matchesFilter(node('b'), { deadlineBefore: NOW - 100 }, NOW)).toBe(true);
    expect(matchesFilter(node('a'), { deadlineBefore: NOW - 100 }, NOW)).toBe(false);
    expect(matchesFilter(node('c'), { deadlineBefore: NOW + 9999 }, NOW)).toBe(false);
  });

  it('overdue means deadline set, not completed, and deadline < now', () => {
    expect(matchesFilter(node('b'), { overdue: true }, NOW)).toBe(true);
    expect(matchesFilter(node('a'), { overdue: true }, NOW)).toBe(false); // future deadline
    expect(matchesFilter(node('c'), { overdue: true }, NOW)).toBe(false); // no deadline
    tree.apply({ kind: 'complete', id: 'b' });
    expect(matchesFilter(node('b'), { overdue: true }, NOW)).toBe(false); // completed
  });

  it('createdAfter and createdBefore are inclusive', () => {
    expect(matchesFilter(node('b'), { createdAfter: 200 }, NOW)).toBe(true);
    expect(matchesFilter(node('a'), { createdAfter: 200 }, NOW)).toBe(false);
    expect(matchesFilter(node('b'), { createdBefore: 200 }, NOW)).toBe(true);
    expect(matchesFilter(node('b'), { createdAfter: 100, createdBefore: 199 }, NOW)).toBe(false);
  });

  it('status matches only completed or only uncompleted nodes', () => {
    const t = Tree.fromOps([
      add(ROOT_ID, 'done'),
      add(ROOT_ID, 'todo'),
      { kind: 'complete', id: 'done' },
    ]);
    const n = (id: string): Node => t.getNode(id)!;
    expect(matchesFilter(n('done'), { status: true }, NOW)).toBe(true);
    expect(matchesFilter(n('todo'), { status: true }, NOW)).toBe(false);
    expect(matchesFilter(n('todo'), { status: false }, NOW)).toBe(true);
    expect(matchesFilter(n('done'), { status: false }, NOW)).toBe(false);
  });
});

describe('filterTree', () => {
  const tree = Tree.fromOps([
    add(ROOT_ID, 'a', { note: 'alpha' }),
    add('a', 'a1', { note: 'deep' }),
    add('a1', 'a1x', { note: 'target' }),
    add(ROOT_ID, 'b', { note: 'beta' }),
  ]);

  it('an empty filter returns the full tree with every non-root node matched', () => {
    const view = filterTree(tree.getRoot(), {});
    expect(view.node.id).toBe(ROOT_ID);
    expect(view.matched).toBe(false);
    expect(view.children.map((c) => c.node.id)).toEqual(['a', 'b']);
    for (const c of view.children) {
      expect(c.matched).toBe(true);
    }
  });

  it('a keyword match keeps the ancestor chain as context', () => {
    const view = filterTree(tree.getRoot(), { keyword: 'target' });
    expect(view.children).toHaveLength(1);
    const a = view.children[0];
    expect(a.node.id).toBe('a');
    expect(a.matched).toBe(false);
    const a1 = a.children[0];
    expect(a1.node.id).toBe('a1');
    expect(a1.matched).toBe(false);
    const a1x = a1.children[0];
    expect(a1x.node.id).toBe('a1x');
    expect(a1x.matched).toBe(true);
    expect(a1x.children).toHaveLength(0);
  });

  it('prunes non-matching sibling subtrees', () => {
    const view = filterTree(tree.getRoot(), { keyword: 'alpha' });
    expect(view.children.map((c) => c.node.id)).toEqual(['a']);
    expect(view.children[0].matched).toBe(true); // 'a' itself matches
    expect(view.children[0].children).toHaveLength(0); // non-matching descendants pruned
  });

  it('returns an empty view when nothing matches', () => {
    const view = filterTree(tree.getRoot(), { keyword: 'zzz' });
    expect(view.node.id).toBe(ROOT_ID);
    expect(view.children).toHaveLength(0);
  });

  it('overdue uses the injected now for descendants', () => {
    const t = Tree.fromOps([
      add(ROOT_ID, 'x'),
      add('x', 'y', { deadline: 50 }),
    ]);
    const view = filterTree(t.getRoot(), { overdue: true }, 100);
    expect(view.children.map((c) => c.node.id)).toEqual(['x']);
    expect(view.children[0].children.map((c) => c.node.id)).toEqual(['y']);
    expect(view.children[0].children[0].matched).toBe(true);
  });
});
