import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeOperation } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';

interface Row {
  id: number;
  opId: string;
  parentOpId: string | null;
  op: unknown;
}

interface Tx {
  historyNode: {
    findMany: (args: { where?: { id: { gt: number } }; orderBy: { id: 'asc' } }) => Promise<Row[]>;
    findUnique: (args: { where: { opId: string } }) => Promise<Row | null>;
    create: (args: { data: { id?: number; opId: string; parentOpId: string | null; op: unknown } }) => Promise<Row>;
    delete: (args: { where: { opId: string } }) => Promise<Row>;
    deleteMany: () => Promise<{ count: number }>;
  };
  meta: {
    findUnique: (args: { where: { key: string } }) => Promise<{ key: string; value: string } | null>;
    upsert: (args: {
      where: { key: string };
      update: { value: string };
      create: { key: string; value: string };
    }) => Promise<{ key: string; value: string }>;
    deleteMany: (args: { where: { key: string } }) => Promise<{ count: number }>;
  };
}

const { prismaMock, resetDb } = vi.hoisted(() => {
  const rows = new Map<number, Row>();
  const meta = new Map<string, string>();
  let nextId = 1;

  const resetDb = () => {
    rows.clear();
    meta.clear();
    nextId = 1;
  };

  const tx: Tx = {
    historyNode: {
      async findMany(args) {
        const gt = args.where?.id.gt;
        return [...rows.values()]
          .filter((r) => gt === undefined || r.id > gt)
          .sort((a, b) => a.id - b.id);
      },
      async findUnique({ where }) {
        for (const row of rows.values()) if (row.opId === where.opId) return row;
        return null;
      },
      async create({ data }) {
        const row: Row = {
          id: data.id ?? nextId++,
          opId: data.opId,
          parentOpId: data.parentOpId,
          op: data.op,
        };
        rows.set(row.id, row);
        return row;
      },
      async delete({ where }) {
        for (const [id, row] of rows) {
          if (row.opId === where.opId) {
            rows.delete(id);
            return row;
          }
        }
        throw new Error(`row ${where.opId} not found`);
      },
      async deleteMany() {
        const n = rows.size;
        rows.clear();
        return { count: n };
      },
    },
    meta: {
      async findUnique({ where }) {
        const value = meta.get(where.key);
        return value === undefined ? null : { key: where.key, value };
      },
      async upsert({ where, update, create }) {
        const entry = { key: where.key, value: meta.has(where.key) ? update.value : create.value };
        meta.set(where.key, entry.value);
        return entry;
      },
      async deleteMany({ where }) {
        const had = meta.delete(where.key);
        return { count: had ? 1 : 0 };
      },
    },
  };

  const prismaMock = {
    historyNode: tx.historyNode,
    meta: tx.meta,
    async $transaction<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
      const snapshot = { rows: new Map(rows), meta: new Map(meta), nextId };
      try {
        return await fn(tx);
      } catch (e) {
        rows.clear();
        for (const [k, v] of snapshot.rows) rows.set(k, v);
        meta.clear();
        for (const [k, v] of snapshot.meta) meta.set(k, v);
        nextId = snapshot.nextId;
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

describe('HistoryStore', () => {
  beforeEach(() => resetDb());

  it('appendBatch appends in order and updates the tree', async () => {
    const store = new HistoryStore();
    const result = await store.appendBatch([
      { kind: 'add', id: 'h1', op: op('a') },
      { kind: 'add', id: 'h2', op: op('b') },
    ]);
    expect(result.added.map((n) => n.id)).toEqual(['h1', 'h2']);
    expect(result.removed).toEqual([]);
    expect((await store.all()).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect(store.getTree().nodeCount()).toBe(2);
  });

  it('skips duplicate ids with the same op (idempotent retry)', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    const result = await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    expect(result.added).toEqual([]);
    expect((await store.all())).toHaveLength(1);
    expect(store.getTree().nodeCount()).toBe(1);
  });

  it('rejects a duplicate id with a different op, atomically', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    await expect(
      store.appendBatch([
        { kind: 'add', id: 'h2', op: op('b') },
        { kind: 'add', id: 'h1', op: { kind: 'rename', id: 'a', name: 'X' } },
      ]),
    ).rejects.toBeInstanceOf(DuplicateOpError);
    // the batch rolled back: h2 must not have been appended
    expect((await store.all()).map((n) => n.id)).toEqual(['h1']);
    expect(store.getTree().getNode('b')).toBeUndefined();
  });

  it('rejects a sibling name collision atomically with ValidationError', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    await expect(
      store.appendBatch([
        { kind: 'add', id: 'h2', op: op('b') },
        { kind: 'add', id: 'h3', op: { kind: 'add', parentId: ROOT_ID, id: 'b2', name: 'b', weight: 2 } },
      ]),
    ).rejects.toBeInstanceOf(ValidationError);
    // nothing of the batch was appended
    expect((await store.all()).map((n) => n.id)).toEqual(['h1']);
    expect(store.getTree().getNode('b')).toBeUndefined();
  });

  it('remove undoes the head and rolls the tree back', async () => {
    const store = new HistoryStore();
    await store.appendBatch([
      { kind: 'add', id: 'h1', op: op('a') },
      { kind: 'add', id: 'h2', op: op('b') },
    ]);
    const result = await store.appendBatch([{ kind: 'remove', id: 'h2' }]);
    expect(result.removed).toEqual(['h2']);
    expect((await store.all()).map((n) => n.id)).toEqual(['h1']);
    expect(store.getTree().getNode('b')).toBeUndefined();
    expect(store.getTree().getNode('a')).toBeDefined();
  });

  it('rejects removing a non-head entry', async () => {
    const store = new HistoryStore();
    await store.appendBatch([
      { kind: 'add', id: 'h1', op: op('a') },
      { kind: 'add', id: 'h2', op: op('b') },
    ]);
    await expect(store.appendBatch([{ kind: 'remove', id: 'h1' }])).rejects.toBeInstanceOf(HeadUndoError);
    await expect(store.appendBatch([{ kind: 'remove', id: 'missing' }])).rejects.toBeInstanceOf(HeadUndoError);
    expect((await store.all())).toHaveLength(2);
  });

  it('since returns entries after the cursor; unknown cursor returns the whole chain', async () => {
    const store = new HistoryStore();
    await store.appendBatch([
      { kind: 'add', id: 'h1', op: op('a') },
      { kind: 'add', id: 'h2', op: op('b') },
      { kind: 'add', id: 'h3', op: op('c') },
    ]);
    expect((await store.since('h1')).nodes.map((n) => n.id)).toEqual(['h2', 'h3']);
    expect((await store.since('h1')).cursorFound).toBe(true);
    expect((await store.since('h3')).nodes).toEqual([]);
    expect((await store.since('missing')).nodes.map((n) => n.id)).toEqual(['h1', 'h2', 'h3']);
    expect((await store.since('missing')).cursorFound).toBe(false);
    expect((await store.since(null)).cursorFound).toBe(true);
    expect((await store.since(null)).nodes.map((n) => n.id)).toEqual(['h1', 'h2', 'h3']);
  });

  it('getById finds an entry or returns null', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    expect((await store.getById('h1'))?.op).toEqual(op('a'));
    expect(await store.getById('missing')).toBeNull();
  });

  it('replace swaps the history when the base matches the head', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    await store.replace('h1', [node('m1'), node('m2')]);
    expect((await store.all()).map((n) => n.id)).toEqual(['m1', 'm2']);
    expect(store.getTree().nodeCount()).toBe(2);
    expect(store.getTree().getNode('a')).toBeUndefined();
  });

  it('replace rejects a stale base with BaseMismatchError and keeps the history', async () => {
    const store = new HistoryStore();
    await store.appendBatch([
      { kind: 'add', id: 'h1', op: op('a') },
      { kind: 'add', id: 'h2', op: op('b') },
    ]);
    await expect(store.replace('h1', [node('m1')])).rejects.toBeInstanceOf(BaseMismatchError);
    expect((await store.all()).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect(store.getTree().getNode('b')).toBeDefined();
  });

  it('replace accepts a null base only when the history is empty', async () => {
    const store = new HistoryStore();
    await expect(store.replace(null, [node('m1')])).resolves.toBeUndefined();
    expect((await store.all()).map((n) => n.id)).toEqual(['m1']);
    await expect(store.replace(null, [node('m2')])).rejects.toBeInstanceOf(BaseMismatchError);
  });

  it('since works after a replace', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    await store.replace('h1', [node('m1'), node('m2')]);
    expect((await store.since('m1')).nodes.map((n) => n.id)).toEqual(['m2']);
    expect((await store.since('m1')).cursorFound).toBe(true);
    expect((await store.since('h1')).cursorFound).toBe(false);
  });

  it('load restores history and tree from the database', async () => {
    const store = new HistoryStore();
    await store.appendBatch([
      { kind: 'add', id: 'h1', op: op('a') },
      { kind: 'add', id: 'h2', op: op('b') },
    ]);
    const reloaded = new HistoryStore();
    await reloaded.load();
    expect((await reloaded.all()).map((n) => n.id)).toEqual(['h1', 'h2']);
    expect(reloaded.getTree().nodeCount()).toBe(2);
    // and the reloaded store keeps accepting appends
    await reloaded.appendBatch([{ kind: 'add', id: 'h3', op: op('c') }]);
    expect(reloaded.getTree().nodeCount()).toBe(3);
  });

  it('a batch can add and undo its own head', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    const result = await store.appendBatch([
      { kind: 'add', id: 'h2', op: op('b') },
      { kind: 'remove', id: 'h2' },
    ]);
    expect(result.added.map((n) => n.id)).toEqual(['h2']);
    expect(result.removed).toEqual(['h2']);
    expect((await store.all()).map((n) => n.id)).toEqual(['h1']);
    expect(store.getTree().getNode('b')).toBeUndefined();
  });

  it('accepts tree-op removes of already-removed nodes (idempotent)', async () => {
    const store = new HistoryStore();
    await store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    await store.appendBatch([{ kind: 'add', id: 'h2', op: { kind: 'remove', id: 'a' } }]);
    expect(store.getTree().nodeCount()).toBe(0);
    // a second client removing the same node must not fail
    await expect(
      store.appendBatch([{ kind: 'add', id: 'h3', op: { kind: 'remove', id: 'a' } }]),
    ).resolves.toBeDefined();
    expect(store.getTree().nodeCount()).toBe(0);
  });

  it('drain waits for in-flight appends', async () => {
    const store = new HistoryStore();
    const p1 = store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    await store.drain();
    expect((await store.all()).map((n) => n.id)).toEqual(['h1']);
    await p1;
  });

  it('drain waits for appends that arrive while draining', async () => {
    const store = new HistoryStore();
    const p1 = store.appendBatch([{ kind: 'add', id: 'h1', op: op('a') }]);
    const draining = store.drain();
    const p2 = store.appendBatch([{ kind: 'add', id: 'h2', op: op('b') }]);
    await draining;
    expect((await store.all()).map((n) => n.id)).toEqual(['h1', 'h2']);
    await p1;
    await p2;
  });

  it('drain resolves immediately when idle', async () => {
    const store = new HistoryStore();
    await store.drain();
    expect(store.getTree().nodeCount()).toBe(0);
  });
});
