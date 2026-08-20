import { describe, expect, it } from 'vitest';
import { ROOT_ID, Tree } from '../src/index';

const add = (parentId: string, id: string, weight = 1, name = id) =>
  ({ kind: 'add', parentId, id, name, weight }) as const;

describe('Tree', () => {
  it('builds from add ops', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      add('a', 'b'),
    ]);
    expect(tree.getRoot().children).toHaveLength(1);
    expect(tree.getNode('b')?.name).toBe('b');
    expect(tree.nodeCount()).toBe(2);
  });

  it('orders siblings by (weight, id)', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'b', 2),
      add(ROOT_ID, 'a', 1),
      add(ROOT_ID, 'c', 2),
    ]);
    expect(tree.getRoot().children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies rename, move and complete', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a', 1),
      add(ROOT_ID, 'c', 2),
      { kind: 'rename', id: 'c', name: 'C2' },
      { kind: 'move', id: 'c', parentId: 'a', weight: 0 },
      { kind: 'complete', id: 'a' },
    ]);
    expect(tree.getNode('a')?.status).toBe(true);
    expect(tree.getNode('a')?.children.map((c) => c.id)).toEqual(['c']);
    expect(tree.getNode('c')?.name).toBe('C2');
  });

  it('move reorders siblings by its new weight', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a', 1),
      add(ROOT_ID, 'b', 5),
      add(ROOT_ID, 'c', 10),
    ]);
    tree.apply({ kind: 'move', id: 'c', parentId: ROOT_ID, weight: 0 });
    expect(tree.getRoot().children.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('remove deletes the whole subtree', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      add('a', 'b'),
      { kind: 'remove', id: 'a' },
    ]);
    expect(tree.getNode('b')).toBeUndefined();
    expect(tree.nodeCount()).toBe(0);
  });

  it('rejects removing the root', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    expect(() => tree.apply({ kind: 'remove', id: ROOT_ID })).toThrow();
  });

  it('copy is shallow: name, status and reminders, no children', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a', 1),
      add('a', 'b'),
      { kind: 'complete', id: 'a' },
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 100 },
      { kind: 'copy', id: 'a', parentId: ROOT_ID, newId: 'a2', weight: 5 },
    ]);
    const copyNode = tree.getNode('a2');
    expect(copyNode?.name).toBe('a');
    expect(copyNode?.status).toBe(true);
    expect(copyNode?.children).toHaveLength(0);
    expect(copyNode?.reminders).toHaveLength(1);
    expect(tree.getRoot().children.map((c) => c.id)).toEqual(['a', 'a2']);
  });

  it('copy derives reminder ids so source and copy stay independent', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 100 },
      { kind: 'copy', id: 'a', parentId: ROOT_ID, newId: 'a2', weight: 5 },
    ]);
    expect(tree.getNode('a2')?.reminders[0]?.id).toBe('a2#r1');
    tree.apply({ kind: 'remove_reminder', rmdId: 'r1' });
    expect(tree.getNode('a')?.reminders).toHaveLength(0);
    expect(tree.getNode('a2')?.reminders).toHaveLength(1);
  });

  it('edit_reminder applies partial patches', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 100, repeat: 50 },
    ]);
    tree.apply({ kind: 'edit_reminder', rmdId: 'r1', name: 'R2' });
    tree.apply({ kind: 'edit_reminder', rmdId: 'r1', active: false });
    tree.apply({ kind: 'edit_reminder', rmdId: 'r1', repeat: null });
    const r = tree.getNode('a')?.reminders[0];
    expect(r?.name).toBe('R2');
    expect(r?.deadline).toBe(100);
    expect(r?.repeat).toBeUndefined();
    expect(r?.active).toBe(false);
  });

  it('rejects editing an unknown reminder', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    expect(() => tree.apply({ kind: 'edit_reminder', rmdId: 'nope', name: 'x' })).toThrow();
  });

  it('rejects duplicate reminder ids', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    tree.apply({ kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 1 });
    expect(() => tree.apply({ kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R2', deadline: 2 })).toThrow();
  });

  it('rejects moving a node into its own subtree', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      add('a', 'b'),
    ]);
    expect(() => tree.apply({ kind: 'move', id: 'a', parentId: 'b', weight: 0 })).toThrow();
  });

  it('rejects duplicate node ids', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    expect(() => tree.apply(add(ROOT_ID, 'a', 2))).toThrow();
  });

  it('clone preserves every mutation kind', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a', 1),
      add(ROOT_ID, 'c', 2),
      { kind: 'rename', id: 'c', name: 'C2' },
      { kind: 'move', id: 'c', parentId: 'a', weight: 0 },
      { kind: 'complete', id: 'a' },
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 100 },
      { kind: 'edit_reminder', rmdId: 'r1', deadline: 200, active: false },
    ]);
    const clone = tree.clone();
    expect(clone.getParentId('c')).toBe('a');
    expect(clone.getNode('c')?.name).toBe('C2');
    expect(clone.getNode('a')?.status).toBe(true);
    expect(clone.getNode('a')?.reminders[0]).toMatchObject({ deadline: 200, active: false });
  });

  it('clone preserves removals', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      add('a', 'b'),
      { kind: 'remove', id: 'b' },
    ]);
    const clone = tree.clone();
    expect(clone.getNode('b')).toBeUndefined();
    expect(clone.nodeCount()).toBe(1);
  });

  it('clone rejects the same move cycles as the original', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      add('a', 'b'),
      add('b', 'c'),
      { kind: 'move', id: 'c', parentId: 'a', weight: 0 },
    ]);
    const clone = tree.clone();
    expect(() => clone.apply({ kind: 'move', id: 'a', parentId: 'c', weight: 1 })).toThrow();
    expect(() => tree.apply({ kind: 'move', id: 'a', parentId: 'c', weight: 1 })).toThrow();
  });

  it('mutating a clone does not affect the original', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    const clone = tree.clone();
    clone.apply({ kind: 'rename', id: 'a', name: 'renamed' });
    clone.apply({ kind: 'complete', id: 'a' });
    expect(tree.getNode('a')?.name).toBe('a');
    expect(tree.getNode('a')?.status).toBe(false);
  });

  it('uncomplete reverts a completed node', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a'), { kind: 'complete', id: 'a' }]);
    tree.apply({ kind: 'uncomplete', id: 'a' });
    expect(tree.getNode('a')?.status).toBe(false);
  });

  it('removing an already-removed node is a no-op (idempotent)', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a'), { kind: 'remove', id: 'a' }]);
    expect(() => tree.apply({ kind: 'remove', id: 'a' })).not.toThrow();
    expect(tree.nodeCount()).toBe(0);
  });

  it('removing an unknown reminder is a no-op (idempotent)', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    expect(() => tree.apply({ kind: 'remove_reminder', rmdId: 'missing' })).not.toThrow();
  });

  it('rejects a copy whose newId already exists', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a'), add(ROOT_ID, 'b')]);
    expect(() => tree.apply({ kind: 'copy', id: 'a', parentId: ROOT_ID, newId: 'b', weight: 5 })).toThrow();
  });

  it('rejects ops targeting unknown nodes', () => {
    const tree = Tree.fromOps([add(ROOT_ID, 'a')]);
    expect(() => tree.apply({ kind: 'rename', id: 'missing', name: 'x' })).toThrow();
    expect(() => tree.apply({ kind: 'complete', id: 'missing' })).toThrow();
    expect(() => tree.apply({ kind: 'uncomplete', id: 'missing' })).toThrow();
    expect(() => tree.apply({ kind: 'move', id: 'a', parentId: 'missing', weight: 0 })).toThrow();
    expect(() => tree.apply({ kind: 'copy', id: 'missing', parentId: ROOT_ID, newId: 'x', weight: 0 })).toThrow();
    expect(() => tree.apply({ kind: 'add_reminder', nodeId: 'missing', rmdId: 'r1', name: 'R', deadline: 1 })).toThrow();
  });

  it('counts reminders across the tree', () => {
    const tree = Tree.fromOps([
      add(ROOT_ID, 'a'),
      add(ROOT_ID, 'b'),
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R1', deadline: 1 },
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r2', name: 'R2', deadline: 2 },
      { kind: 'add_reminder', nodeId: 'b', rmdId: 'r3', name: 'R3', deadline: 3 },
      { kind: 'remove_reminder', rmdId: 'r2' },
    ]);
    expect(tree.reminderCount()).toBe(2);
  });

  it('sibling order is independent of the order the adds were applied', () => {
    const ops = [
      { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 },
      { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 },
      { kind: 'add', parentId: ROOT_ID, id: 'c', name: 'C', weight: 2 },
    ] as const;
    const forward = Tree.fromOps([...ops]);
    const backward = Tree.fromOps([...ops].reverse());
    expect(forward.getRoot().children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(backward.getRoot().children.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});
