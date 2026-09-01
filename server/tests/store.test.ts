import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarOperation, HistoryOperation, TreeOperation } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import { prismaMock, resetDb, seedUser } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import {
  BaseMismatchError,
  DuplicateOpError,
  HeadUndoError,
  HistoryStore,
  UnknownUserError,
  ValidationError,
} from '../src/store';

const op = (id: string): TreeOperation => ({ kind: 'add', parentId: ROOT_ID, id, name: id, weight: 1 });
const node = (id: string): { id: string; op: TreeOperation } => ({ id, op: op(id) });
const add = (id: string, opId = id): HistoryOperation => ({ kind: 'add', id: opId, op: op(id) });

const ALICE = 'alice';
const BOB = 'bob';

describe('HistoryStore', () => {
  beforeEach(async () => {
    resetDb();
    await seedUser(ALICE);
    await seedUser(BOB);
  });

  it('appendBatch appends in order and updates the tree', async () => {
    const store = new HistoryStore();
    const result = await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    expect(result.added.map((n) => n.id)).toEqual(['h1', 'h2']);
    expect(result.removed).toEqual([]);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect((await store.getTreeForUser(ALICE)).tree.nodeCount()).toBe(2);
  });

  it('skips duplicate ids with the same op (idempotent retry)', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    const result = await store.appendBatch(ALICE, [add('a', 'h1')]);
    expect(result.added).toEqual([]);
    expect(await store.all(ALICE)).toHaveLength(1);
    expect((await store.getTreeForUser(ALICE)).tree.nodeCount()).toBe(1);
  });

  it('rejects a duplicate id with a different op, atomically', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await expect(
      store.appendBatch(ALICE, [
        add('b', 'h2'),
        { kind: 'add', id: 'h1', op: { kind: 'rename', id: 'a', name: 'X' } },
      ]),
    ).rejects.toBeInstanceOf(DuplicateOpError);
    // the batch rolled back: h2 must not have been appended
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('b')).toBeUndefined();
  });

  it('rejects a sibling name collision atomically with ValidationError', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await expect(
      store.appendBatch(ALICE, [
        add('b', 'h2'),
        { kind: 'add', id: 'h3', op: { kind: 'add', parentId: ROOT_ID, id: 'b2', name: 'b', weight: 2 } },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
    // nothing of the batch was appended
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('b')).toBeUndefined();
  });

  it('remove undoes the head and rolls the tree back', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    const result = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }]);
    expect(result.removed).toEqual(['h2']);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    const state = await store.getTreeForUser(ALICE);
    expect(state.tree.getNode('b')).toBeUndefined();
    expect(state.tree.getNode('a')).toBeDefined();
  });

  it('rejects removing a non-head entry', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    await expect(store.appendBatch(ALICE, [{ kind: 'remove', id: 'h1' }])).rejects.toBeInstanceOf(HeadUndoError);
    expect(await store.all(ALICE)).toHaveLength(2);
  });

  it('removing an already-removed or unknown entry is an idempotent no-op', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }]);
    // a retry of the same undo (lost response) and an unknown id must not fail
    const retry = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }]);
    expect(retry.removed).toEqual([]);
    const unknown = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'missing' }]);
    expect(unknown.removed).toEqual([]);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
  });

  it('rejects an add that depends on a node its own batch removes', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await expect(
      store.appendBatch(ALICE, [
        { kind: 'remove', id: 'h1' },
        { kind: 'add', id: 'h2', op: { kind: 'add', parentId: 'a', id: 'b', name: 'B', weight: 1 } },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
    // the whole batch was rejected: nothing changed
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('a')).toBeDefined();
  });

  it('accepts an add after an undo when it does not depend on the removed entry', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    const result = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }, add('c', 'h3')]);
    expect(result.removed).toEqual(['h2']);
    expect(result.added.map((n) => n.id)).toEqual(['h3']);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h3']);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('c')).toBeDefined();
  });

  it('since returns entries after the cursor; unknown cursor returns the whole chain', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2'), add('c', 'h3')]);
    expect((await store.since(ALICE, 'h1')).nodes.map((n) => n.id)).toEqual(['h2', 'h3']);
    expect((await store.since(ALICE, 'h1')).cursorFound).toBe(true);
    expect((await store.since(ALICE, 'h3')).nodes).toEqual([]);
    expect((await store.since(ALICE, 'missing')).nodes.map((n) => n.id)).toEqual(['h1', 'h2', 'h3']);
    expect((await store.since(ALICE, 'missing')).cursorFound).toBe(false);
    expect((await store.since(ALICE, null)).cursorFound).toBe(true);
    expect((await store.since(ALICE, null)).nodes.map((n) => n.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('getById finds an entry or returns null', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    expect((await store.getById(ALICE, 'h1'))?.op).toEqual(op('a'));
    expect(await store.getById(ALICE, 'missing')).toBeNull();
  });

  it('replace swaps the history when the base matches the head', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.replace(ALICE, 'h1', [node('m1'), node('m2')]);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['m1', 'm2']);
    const state = await store.getTreeForUser(ALICE);
    expect(state.tree.nodeCount()).toBe(2);
    expect(state.tree.getNode('a')).toBeUndefined();
  });

  it('replace rejects a stale base with BaseMismatchError and keeps the history', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    await expect(store.replace(ALICE, 'h1', [node('m1')])).rejects.toBeInstanceOf(BaseMismatchError);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('b')).toBeDefined();
  });

  it('replace accepts a null base only when the history is empty', async () => {
    const store = new HistoryStore();
    await expect(store.replace(ALICE, null, [node('m1')])).resolves.toBeUndefined();
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['m1']);
    await expect(store.replace(ALICE, null, [node('m2')])).rejects.toBeInstanceOf(BaseMismatchError);
  });

  it('since works after a replace', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.replace(ALICE, 'h1', [node('m1'), node('m2')]);
    expect((await store.since(ALICE, 'm1')).nodes.map((n) => n.id)).toEqual(['m2']);
    expect((await store.since(ALICE, 'm1')).cursorFound).toBe(true);
    expect((await store.since(ALICE, 'h1')).cursorFound).toBe(false);
  });

  it('load restores history and tree from the database', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    const reloaded = new HistoryStore();
    await reloaded.load();
    expect((await reloaded.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect((await reloaded.getTreeForUser(ALICE)).tree.nodeCount()).toBe(2);
    // and the reloaded store keeps accepting appends
    await reloaded.appendBatch(ALICE, [add('c', 'h3')]);
    expect((await reloaded.getTreeForUser(ALICE)).tree.nodeCount()).toBe(3);
  });

  it('a batch can add and undo its own head', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    const result = await store.appendBatch(ALICE, [add('b', 'h2'), { kind: 'remove', id: 'h2' }]);
    expect(result.added.map((n) => n.id)).toEqual(['h2']);
    expect(result.removed).toEqual(['h2']);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('b')).toBeUndefined();
  });

  it('accepts tree-op removes of already-removed nodes (idempotent)', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.appendBatch(ALICE, [{ kind: 'add', id: 'h2', op: { kind: 'remove', id: 'a' } }]);
    expect((await store.getTreeForUser(ALICE)).tree.nodeCount()).toBe(0);
    // a second client removing the same node must not fail
    await expect(
      store.appendBatch(ALICE, [{ kind: 'add', id: 'h3', op: { kind: 'remove', id: 'a' } }]),
    ).resolves.toBeDefined();
    expect((await store.getTreeForUser(ALICE)).tree.nodeCount()).toBe(0);
  });

  it('drain waits for in-flight appends', async () => {
    const store = new HistoryStore();
    const p1 = store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.drain();
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    await p1;
  });

  it('drain waits for appends that arrive while draining', async () => {
    const store = new HistoryStore();
    const p1 = store.appendBatch(ALICE, [add('a', 'h1')]);
    const draining = store.drain();
    const p2 = store.appendBatch(ALICE, [add('b', 'h2')]);
    await draining;
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2']);
    await p1;
    await p2;
  });

  it('drain resolves immediately when idle', async () => {
    const store = new HistoryStore();
    await store.drain();
    expect((await store.getTreeForUser(ALICE)).tree.nodeCount()).toBe(0);
  });

  it('two users may use the same opId independently', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.appendBatch(BOB, [add('a', 'h1')]);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    expect((await store.all(BOB)).map((n) => n.id)).toEqual(['h1']);
  });

  it('users do not see each other\'s history or tree', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    expect(await store.all(BOB)).toEqual([]);
    expect((await store.getTreeForUser(BOB)).tree.nodeCount()).toBe(0);
  });

  it('a cross-user cursor yields cursorFound=false with the own full history', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    await store.appendBatch(BOB, [add('x', 'x1')]);
    const page = await store.since(BOB, 'h2');
    expect(page.cursorFound).toBe(false);
    expect(page.nodes.map((n) => n.id)).toEqual(['x1']);
  });

  it('replace only rewrites the user\'s own history', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.appendBatch(BOB, [add('x', 'x1')]);
    await store.replace(ALICE, 'h1', [node('m1')]);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['m1']);
    expect((await store.all(BOB)).map((n) => n.id)).toEqual(['x1']);
  });

  it('head and undo are per-user', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    await store.appendBatch(BOB, [add('x', 'x1')]);
    // alice's head is h2 and she can undo it
    const result = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }]);
    expect(result.removed).toEqual(['h2']);
    // bob's head is x1 — removing alice's id is a no-op in bob's history
    // (ids are namespaced per user)
    const bobResult = await store.appendBatch(BOB, [{ kind: 'remove', id: 'h2' }]);
    expect(bobResult.removed).toEqual([]);
    expect((await store.all(BOB)).map((n) => n.id)).toEqual(['x1']);
  });

  it('rejects an unknown user (users are only created via /api/register)', async () => {
    const store = new HistoryStore();
    await expect(store.appendBatch('carol', [add('c', 'h1')])).rejects.toBeInstanceOf(UnknownUserError);
  });

  describe('calendar blocks', () => {
    const addBlock = (id: string, opId: string, blockOp: CalendarOperation): HistoryOperation =>
      ({ kind: 'add', id: opId, op: blockOp });
    const block = (id: string, nodeId?: string): CalendarOperation =>
      ({ kind: 'add_block', id, name: id, start: 0, end: 10, nodeId });

    it('appends block ops and derives the calendar', async () => {
      const store = new HistoryStore();
      await store.appendBatch(ALICE, [add('a', 'h1'), addBlock('b1', 'h2', block('b1', 'a'))]);
      const state = await store.getTreeForUser(ALICE);
      expect(state.calendar.blockCount()).toBe(1);
      expect(state.calendar.getBlocks()[0]).toMatchObject({ id: 'b1', nodeId: 'a' });
    });

    it('propagates completion through the stored state', async () => {
      const store = new HistoryStore();
      await store.appendBatch(ALICE, [add('a', 'h1'), addBlock('b1', 'h2', block('b1', 'a'))]);
      await store.appendBatch(ALICE, [{ kind: 'add', id: 'h3', op: { kind: 'complete', id: 'a' } }]);
      const state = await store.getTreeForUser(ALICE);
      expect(state.tree.getNode('a')!.status).toBe(true);
      expect(state.calendar.getBlocks()[0].status).toBe(true);
    });

    it('rejects an invalid block op and appends nothing', async () => {
      const store = new HistoryStore();
      await expect(
        store.appendBatch(ALICE, [
          add('a', 'h1'),
          addBlock('b1', 'h2', { kind: 'add_block', id: 'b1', name: 'B', start: 10, end: 10 }),
        ]),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await store.all(ALICE)).toHaveLength(0);
    });

    it('skips a duplicate block op with the same op (idempotent retry)', async () => {
      const store = new HistoryStore();
      const blockOp = block('b1');
      await store.appendBatch(ALICE, [{ kind: 'add', id: 'h1', op: blockOp }]);
      const result = await store.appendBatch(ALICE, [{ kind: 'add', id: 'h1', op: blockOp }]);
      expect(result.added).toEqual([]);
      expect(await store.all(ALICE)).toHaveLength(1);
    });

    it('rebuilds blocks on undo and rewrite', async () => {
      const store = new HistoryStore();
      await store.appendBatch(ALICE, [add('a', 'h1'), addBlock('b1', 'h2', block('b1', 'a'))]);
      // undo the add_block: the block disappears
      await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }]);
      expect((await store.getTreeForUser(ALICE)).calendar.blockCount()).toBe(0);
      // rewrite replaces the whole history: block comes back
      await store.replace(ALICE, 'h1', [{ id: 'h1', op: op('a') }, { id: 'h2', op: block('b1', 'a') }]);
      const state = await store.getTreeForUser(ALICE);
      expect(state.calendar.blockCount()).toBe(1);
      expect(state.calendar.getBlocks()[0].nodeId).toBe('a');
    });
  });
});
