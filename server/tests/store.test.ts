import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeOperation } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';

interface UserRow {
  id: number;
  name: string;
  headOpId: string | null;
}

interface Row {
  id: number;
  userId: number;
  opId: string;
  parentOpId: string | null;
  op: unknown;
}

interface Tx {
  user: {
    findUnique: (args: { where: { id: number } }) => Promise<UserRow | null>;
    findMany: () => Promise<UserRow[]>;
    upsert: (args: { where: { name: string }; update: object; create: { name: string } }) => Promise<UserRow>;
    update: (args: { where: { id: number }; data: { headOpId: string | null } }) => Promise<UserRow>;
  };
  historyNode: {
    findMany: (args: { where?: { userId?: number; id?: { gt: number } }; orderBy: { id: 'asc' } }) => Promise<Row[]>;
    findUnique: (args: { where: { userId_opId: { userId: number; opId: string } } }) => Promise<Row | null>;
    create: (args: { data: { userId: number; opId: string; parentOpId: string | null; op: unknown } }) => Promise<Row>;
    delete: (args: { where: { userId_opId: { userId: number; opId: string } } }) => Promise<Row>;
    deleteMany: (args: { where: { userId: number } }) => Promise<{ count: number }>;
  };
}

const { prismaMock, resetDb } = vi.hoisted(() => {
  const rows = new Map<number, Row>();
  const users = new Map<number, UserRow>();
  const usersByName = new Map<string, number>();
  let nextId = 1;
  let nextUserId = 1;

  const resetDb = () => {
    rows.clear();
    users.clear();
    usersByName.clear();
    nextId = 1;
    nextUserId = 1;
  };

  const mustGetUser = (id: number): UserRow => {
    const user = users.get(id);
    if (!user) throw new Error(`user ${id} not found`);
    return user;
  };

  const tx: Tx = {
    user: {
      async findUnique({ where }) {
        return users.get(where.id) ?? null;
      },
      async findMany() {
        return [...users.values()];
      },
      async upsert({ where, create }) {
        const id = usersByName.get(where.name);
        if (id !== undefined) return mustGetUser(id);
        const row: UserRow = { id: nextUserId++, name: create.name, headOpId: null };
        users.set(row.id, row);
        usersByName.set(row.name, row.id);
        return row;
      },
      async update({ where, data }) {
        const row = mustGetUser(where.id);
        row.headOpId = data.headOpId;
        return row;
      },
    },
    historyNode: {
      async findMany(args) {
        const uid = args.where?.userId;
        const gt = args.where?.id?.gt;
        return [...rows.values()]
          .filter((r) => (uid === undefined || r.userId === uid) && (gt === undefined || r.id > gt))
          .sort((a, b) => a.id - b.id);
      },
      async findUnique({ where }) {
        for (const row of rows.values()) {
          if (row.userId === where.userId_opId.userId && row.opId === where.userId_opId.opId) return row;
        }
        return null;
      },
      async create({ data }) {
        const row: Row = {
          id: nextId++,
          userId: data.userId,
          opId: data.opId,
          parentOpId: data.parentOpId,
          op: data.op,
        };
        rows.set(row.id, row);
        return row;
      },
      async delete({ where }) {
        for (const [id, row] of rows) {
          if (row.userId === where.userId_opId.userId && row.opId === where.userId_opId.opId) {
            rows.delete(id);
            return row;
          }
        }
        throw new Error('row not found');
      },
      async deleteMany({ where }) {
        let n = 0;
        for (const [id, row] of [...rows]) {
          if (row.userId === where.userId) {
            rows.delete(id);
            n++;
          }
        }
        return { count: n };
      },
    },
  };

  const prismaMock = {
    user: tx.user,
    historyNode: tx.historyNode,
    async $transaction<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
      const snapshot = {
        rows: new Map(rows),
        users: new Map(users),
        usersByName: new Map(usersByName),
        nextId,
        nextUserId,
      };
      try {
        return await fn(tx);
      } catch (e) {
        rows.clear();
        for (const [k, v] of snapshot.rows) rows.set(k, v);
        users.clear();
        for (const [k, v] of snapshot.users) users.set(k, v);
        usersByName.clear();
        for (const [k, v] of snapshot.usersByName) usersByName.set(k, v);
        nextId = snapshot.nextId;
        nextUserId = snapshot.nextUserId;
        throw e;
      }
    },
  };

  return { prismaMock, resetDb };
});

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import { BaseMismatchError, DuplicateOpError, HeadUndoError, HistoryStore, ValidationError } from '../src/store';

const op = (id: string): TreeOperation => ({ kind: 'add', parentId: ROOT_ID, id, name: id, weight: 1 });
const node = (id: string): { id: string; op: TreeOperation } => ({ id, op: op(id) });
const add = (id: string, opId = id) => ({ kind: 'add' as const, id: opId, op: op(id) });

const ALICE = 'alice';
const BOB = 'bob';

describe('HistoryStore', () => {
  beforeEach(() => resetDb());

  it('appendBatch appends in order and updates the tree', async () => {
    const store = new HistoryStore();
    const result = await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    expect(result.added.map((n) => n.id)).toEqual(['h1', 'h2']);
    expect(result.removed).toEqual([]);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect((await store.getTreeForUser(ALICE)).nodeCount()).toBe(2);
  });

  it('skips duplicate ids with the same op (idempotent retry)', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    const result = await store.appendBatch(ALICE, [add('a', 'h1')]);
    expect(result.added).toEqual([]);
    expect(await store.all(ALICE)).toHaveLength(1);
    expect((await store.getTreeForUser(ALICE)).nodeCount()).toBe(1);
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
    expect((await store.getTreeForUser(ALICE)).getNode('b')).toBeUndefined();
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
    expect((await store.getTreeForUser(ALICE)).getNode('b')).toBeUndefined();
  });

  it('remove undoes the head and rolls the tree back', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    const result = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }]);
    expect(result.removed).toEqual(['h2']);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    const tree = await store.getTreeForUser(ALICE);
    expect(tree.getNode('b')).toBeUndefined();
    expect(tree.getNode('a')).toBeDefined();
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
    expect((await store.getTreeForUser(ALICE)).getNode('a')).toBeDefined();
  });

  it('accepts an add after an undo when it does not depend on the removed entry', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    const result = await store.appendBatch(ALICE, [{ kind: 'remove', id: 'h2' }, add('c', 'h3')]);
    expect(result.removed).toEqual(['h2']);
    expect(result.added.map((n) => n.id)).toEqual(['h3']);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h3']);
    expect((await store.getTreeForUser(ALICE)).getNode('c')).toBeDefined();
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
    const tree = await store.getTreeForUser(ALICE);
    expect(tree.nodeCount()).toBe(2);
    expect(tree.getNode('a')).toBeUndefined();
  });

  it('replace rejects a stale base with BaseMismatchError and keeps the history', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1'), add('b', 'h2')]);
    await expect(store.replace(ALICE, 'h1', [node('m1')])).rejects.toBeInstanceOf(BaseMismatchError);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect((await store.getTreeForUser(ALICE)).getNode('b')).toBeDefined();
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
    expect((await reloaded.getTreeForUser(ALICE)).nodeCount()).toBe(2);
    // and the reloaded store keeps accepting appends
    await reloaded.appendBatch(ALICE, [add('c', 'h3')]);
    expect((await reloaded.getTreeForUser(ALICE)).nodeCount()).toBe(3);
  });

  it('a batch can add and undo its own head', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    const result = await store.appendBatch(ALICE, [add('b', 'h2'), { kind: 'remove', id: 'h2' }]);
    expect(result.added.map((n) => n.id)).toEqual(['h2']);
    expect(result.removed).toEqual(['h2']);
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
    expect((await store.getTreeForUser(ALICE)).getNode('b')).toBeUndefined();
  });

  it('accepts tree-op removes of already-removed nodes (idempotent)', async () => {
    const store = new HistoryStore();
    await store.appendBatch(ALICE, [add('a', 'h1')]);
    await store.appendBatch(ALICE, [{ kind: 'add', id: 'h2', op: { kind: 'remove', id: 'a' } }]);
    expect((await store.getTreeForUser(ALICE)).nodeCount()).toBe(0);
    // a second client removing the same node must not fail
    await expect(
      store.appendBatch(ALICE, [{ kind: 'add', id: 'h3', op: { kind: 'remove', id: 'a' } }]),
    ).resolves.toBeDefined();
    expect((await store.getTreeForUser(ALICE)).nodeCount()).toBe(0);
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
    expect((await store.getTreeForUser(ALICE)).nodeCount()).toBe(0);
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
    expect((await store.getTreeForUser(BOB)).nodeCount()).toBe(0);
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

  it('creates a new user lazily on first use', async () => {
    const store = new HistoryStore();
    await store.appendBatch('carol', [add('c', 'h1')]);
    // a fresh store (fresh caches) can load and read carol's data
    const reloaded = new HistoryStore();
    await reloaded.load();
    expect((await reloaded.all('carol')).map((n) => n.id)).toEqual(['h1']);
  });
});
