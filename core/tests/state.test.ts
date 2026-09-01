import { describe, expect, it } from 'vitest';
import { ROOT_ID, WorktreeState } from '../src/index';
import type { Block, Node, Operation } from '../src/index';

const add = (id: string, parentId = ROOT_ID): Operation => ({ kind: 'add', parentId, id, name: id, weight: 1 });
const block = (id: string, nodeId?: string): Operation =>
  ({ kind: 'add_block', id, name: id, start: 0, end: 10, nodeId });
const nodeOf = (state: WorktreeState, id: string): Node => {
  const node = state.tree.getNode(id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return node;
};
const blockById = (state: WorktreeState, id: string): Block => {
  const block = state.calendar.getBlocks().find((b) => b.id === id);
  if (block === undefined) throw new Error(`missing block ${id}`);
  return block;
};

describe('WorktreeState', () => {
  it('completing a node completes its linked block', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a')]);
    state.apply({ kind: 'complete', id: 'a' });
    expect(nodeOf(state, 'a').status).toBe(true);
    expect(blockById(state, 'b1').status).toBe(true);
  });

  it('uncompleting a node uncompletes its linked block', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a'), { kind: 'complete', id: 'a' }]);
    state.apply({ kind: 'uncomplete', id: 'a' });
    expect(nodeOf(state, 'a').status).toBe(false);
    expect(blockById(state, 'b1').status).toBe(false);
  });

  it('completing a block completes its linked node', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a')]);
    state.apply({ kind: 'complete_block', id: 'b1' });
    expect(blockById(state, 'b1').status).toBe(true);
    expect(nodeOf(state, 'a').status).toBe(true);
  });

  it('uncompleting a block uncompletes its linked node', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a'), { kind: 'complete_block', id: 'b1' }]);
    state.apply({ kind: 'uncomplete_block', id: 'b1' });
    expect(nodeOf(state, 'a').status).toBe(false);
  });

  it('completing a parent does not touch blocks of descendant nodes', () => {
    const state = WorktreeState.fromOps([add('a'), add('a-child', 'a'), block('b1', 'a-child')]);
    state.apply({ kind: 'complete', id: 'a' });
    expect(blockById(state, 'b1').status).toBe(false);
  });

  it('node ops leave standalone blocks alone', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1')]);
    state.apply({ kind: 'complete', id: 'a' });
    expect(blockById(state, 'b1').status).toBe(false);
  });

  it('a block linked to a completed node is born completed', () => {
    const state = WorktreeState.fromOps([add('a'), { kind: 'complete', id: 'a' }]);
    state.apply(block('b1', 'a'));
    expect(blockById(state, 'b1').status).toBe(true);
  });

  it('relinking a block aligns its status with the new node', () => {
    const state = WorktreeState.fromOps([add('a'), add('b'), block('b1', 'a'), { kind: 'complete', id: 'b' }]);
    state.apply({ kind: 'edit_block', id: 'b1', nodeId: 'b' });
    expect(blockById(state, 'b1').nodeId).toBe('b');
    expect(blockById(state, 'b1').status).toBe(true);
  });

  it('unlinking a block keeps its own status', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a'), { kind: 'complete_block', id: 'b1' }]);
    state.apply({ kind: 'edit_block', id: 'b1', nodeId: null });
    expect(blockById(state, 'b1').status).toBe(true);
  });

  it('rejects a second block linking the same node (add and edit)', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a')]);
    expect(() => state.apply(block('b2', 'a'))).toThrow(/node already linked to a block/);
    state.apply(block('b2'));
    expect(() => state.apply({ kind: 'edit_block', id: 'b2', nodeId: 'a' })).toThrow(/node already linked to a block/);
  });

  it('rejects blocks linking an unknown node', () => {
    const state = new WorktreeState();
    expect(() => state.apply(block('b1', 'missing'))).toThrow(/unknown node id: missing/);
    state.apply(add('a'));
    expect(() => state.apply({ kind: 'edit_block', id: 'b1', nodeId: 'missing' })).toThrow(/unknown node id/);
  });

  it('removing a node keeps its block but clears the link', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a')]);
    state.apply({ kind: 'remove', id: 'a' });
    expect(state.calendar.blockCount()).toBe(1);
    expect(blockById(state, 'b1').nodeId).toBeUndefined();
    expect(blockById(state, 'b1').status).toBe(false);
  });

  it('removing a subtree clears links of blocks on all its nodes', () => {
    const state = WorktreeState.fromOps([add('a'), add('a-child', 'a'), block('b1', 'a'), block('b2', 'a-child')]);
    state.apply({ kind: 'remove', id: 'a' });
    expect(blockById(state, 'b1').nodeId).toBeUndefined();
    expect(blockById(state, 'b2').nodeId).toBeUndefined();
    expect(state.calendar.blockCount()).toBe(2);
  });

  it('removing an already-gone node clears nothing (idempotent)', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a'), { kind: 'remove', id: 'a' }]);
    state.apply({ kind: 'remove', id: 'a' });
    expect(blockById(state, 'b1').nodeId).toBeUndefined();
  });

  it('undoing the removal restores the link via replay', () => {
    const ops: Operation[] = [add('a'), block('b1', 'a'), { kind: 'remove', id: 'a' }];
    const state = WorktreeState.fromOps(ops);
    expect(blockById(state, 'b1').nodeId).toBeUndefined();
    const restored = WorktreeState.fromOps(ops.slice(0, -1));
    expect(restored.tree.getNode('a')).toBeDefined();
    expect(blockById(restored, 'b1').nodeId).toBe('a');
  });

  it('undoing a complete reverts the propagated block status via replay', () => {
    const ops: Operation[] = [add('a'), block('b1', 'a'), { kind: 'complete', id: 'a' }];
    const state = WorktreeState.fromOps(ops);
    expect(blockById(state, 'b1').status).toBe(true);
    const undone = WorktreeState.fromOps(ops.slice(0, -1));
    expect(nodeOf(undone, 'a').status).toBe(false);
    expect(blockById(undone, 'b1').status).toBe(false);
  });

  it('replays deterministically and survives repeated completes', () => {
    const ops: Operation[] = [
      add('a'),
      block('b1', 'a'),
      { kind: 'complete', id: 'a' },
      { kind: 'complete', id: 'a' },
      { kind: 'complete_block', id: 'b1' },
      { kind: 'complete_block', id: 'b1' },
    ];
    const state = WorktreeState.fromOps(ops);
    expect(nodeOf(state, 'a').status).toBe(true);
    expect(blockById(state, 'b1').status).toBe(true);
  });

  it('copy/rename/move leave links intact', () => {
    const state = WorktreeState.fromOps([add('a'), add('b'), block('b1', 'a')]);
    state.apply({ kind: 'copy', id: 'a', parentId: ROOT_ID, newId: 'a2', weight: 2, name: 'a copy' });
    state.apply({ kind: 'rename', id: 'a', name: 'renamed' });
    state.apply({ kind: 'move', id: 'a', parentId: 'b', weight: 1 });
    expect(blockById(state, 'b1').nodeId).toBe('a');
    expect(nodeOf(state, 'a').name).toBe('renamed');
  });

  it('clone() preserves nodes and blocks and isolates mutations', () => {
    const state = WorktreeState.fromOps([add('a'), block('b1', 'a')]);
    const copy = state.clone();
    copy.apply({ kind: 'complete', id: 'a' });
    copy.apply({ kind: 'remove_block', id: 'b1' });
    expect(nodeOf(state, 'a').status).toBe(false);
    expect(state.calendar.blockCount()).toBe(1);
    expect(nodeOf(copy, 'a').status).toBe(true);
    expect(copy.calendar.blockCount()).toBe(0);
  });
});
