import { describe, expect, it } from 'vitest';
import { ROOT_ID, Tree } from '@worktree/core';
import type { TreeOperation } from '@worktree/core';
import { validateOps } from '../src/validation';

const addOp = (parentId: string, id: string) =>
  ({ kind: 'add', parentId, id, name: id, weight: 1 }) as const;

const histAdd = (id: string, op: TreeOperation) => ({ kind: 'add', id, op }) as const;

describe('validateOps', () => {
  it('accepts ops that apply cleanly to the current tree', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps([histAdd('h1', addOp('a', 'b'))], tree);
    expect(result.ok).toBe(true);
  });

  it('validates the batch against its own rolling state', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [histAdd('h1', addOp('a', 'x')), histAdd('h2', addOp('x', 'y'))],
      tree,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects ops referencing unknown nodes', () => {
    const tree = new Tree();
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'rename', id: 'missing', name: 'x' } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('reports the id of the first invalid op', () => {
    const tree = new Tree();
    const result = validateOps(
      [
        histAdd('h1', addOp(ROOT_ID, 'x')),
        { kind: 'add', id: 'h2', op: { kind: 'rename', id: 'missing', name: 'x' } },
      ],
      tree,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.opId).toBe('h2');
  });

  it('rejects duplicate node ids', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps([histAdd('h1', addOp(ROOT_ID, 'a'))], tree);
    expect(result.ok).toBe(false);
  });

  it('rejects a sibling name collision on add', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [histAdd('h1', { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'a', weight: 2 })],
      tree,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('duplicate sibling name');
  });

  it('rejects invalid names on add', () => {
    const tree = new Tree();
    expect(validateOps([histAdd('h1', { kind: 'add', parentId: ROOT_ID, id: 'a', name: '', weight: 1 })], tree).ok).toBe(false);
    expect(validateOps([histAdd('h1', { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'x/y', weight: 1 })], tree).ok).toBe(false);
  });

  it('rejects renaming to a sibling name but allows its own', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a'), addOp(ROOT_ID, 'b')]);
    expect(validateOps([histAdd('h1', { kind: 'rename', id: 'b', name: 'a' })], tree).ok).toBe(false);
    expect(validateOps([histAdd('h1', { kind: 'rename', id: 'b', name: 'b' })], tree).ok).toBe(true);
  });

  it('rejects moving into a parent with a same-named child', () => {
    const tree = Tree.fromOps([
      addOp(ROOT_ID, 'a'),
      addOp(ROOT_ID, 'b'),
      { kind: 'add', parentId: 'b', id: 'b-child', name: 'a', weight: 1 },
    ]);
    const result = validateOps([histAdd('h1', { kind: 'move', id: 'a', parentId: 'b', weight: 0 })], tree);
    expect(result.ok).toBe(false);
  });

  it('rejects a copy whose effective name collides with a sibling', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [histAdd('h1', { kind: 'copy', id: 'a', parentId: ROOT_ID, newId: 'a2', weight: 5 })],
      tree,
    );
    expect(result.ok).toBe(false);
    const ok = validateOps(
      [histAdd('h1', { kind: 'copy', id: 'a', parentId: ROOT_ID, newId: 'a2', weight: 5, name: 'a-copy' })],
      tree,
    );
    expect(ok.ok).toBe(true);
  });

  it('rejects an empty edit_reminder patch', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    tree.apply({ kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 1 });
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'edit_reminder', rmdId: 'r1' } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a partial edit_reminder patch', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    tree.apply({ kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', name: 'R', deadline: 1 });
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'edit_reminder', rmdId: 'r1', active: false } }],
      tree,
    );
    expect(result.ok).toBe(true);
  });

  it('lets HistoryOperation.remove through (the store checks the head)', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps([{ kind: 'remove', id: 'whatever' }], tree);
    expect(result.ok).toBe(true);
  });

  it('does not mutate the tree it validates against', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    validateOps([histAdd('h1', { kind: 'rename', id: 'a', name: 'renamed' })], tree);
    expect(tree.getNode('a')?.name).toBe('a');
  });

  it('rejects ops on nodes removed earlier in the history (clone regression)', () => {
    const tree = Tree.fromOps([
      addOp(ROOT_ID, 'a'),
      addOp('a', 'b'),
      { kind: 'remove', id: 'b' },
    ]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'rename', id: 'b', name: 'x' } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects move cycles the real tree would reject (clone regression)', () => {
    const tree = Tree.fromOps([
      addOp(ROOT_ID, 'a'),
      addOp('a', 'c'),
      { kind: 'move', id: 'c', parentId: 'a', weight: 0 },
    ]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'move', id: 'a', parentId: 'c', weight: 1 } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects add under an unknown parent', () => {
    const tree = new Tree();
    const result = validateOps([histAdd('h1', addOp('missing', 'a'))], tree);
    expect(result.ok).toBe(false);
  });

  it('rejects move to an unknown parent', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'move', id: 'a', parentId: 'missing', weight: 0 } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects copy of an unknown source', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'copy', id: 'missing', parentId: ROOT_ID, newId: 'x', weight: 0 } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects add_reminder on an unknown node', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'add_reminder', nodeId: 'missing', rmdId: 'r1', name: 'R', deadline: 1 } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects edit_reminder of an unknown reminder', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'edit_reminder', rmdId: 'missing', name: 'x' } }],
      tree,
    );
    expect(result.ok).toBe(false);
  });

  it('accepts removing an already-removed node (idempotent)', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a'), { kind: 'remove', id: 'a' }]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'remove', id: 'a' } }],
      tree,
    );
    expect(result.ok).toBe(true);
  });

  it('accepts remove_reminder of a missing reminder (idempotent)', () => {
    const tree = Tree.fromOps([addOp(ROOT_ID, 'a')]);
    const result = validateOps(
      [{ kind: 'add', id: 'h1', op: { kind: 'remove_reminder', rmdId: 'missing' } }],
      tree,
    );
    expect(result.ok).toBe(true);
  });
});
