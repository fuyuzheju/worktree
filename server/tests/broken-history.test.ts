import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ROOT_ID } from '@worktree/core';
import type { HistoryNode, Operation } from '@worktree/core';
import { prismaMock, resetDb, seedUser } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));
vi.mock('../src/config', () => ({
  config: {
    port: 9997,
    databaseUrl: 'file:./dev.db',
    registrationMode: 'open',
    vapidPublicKey: undefined,
    vapidPrivateKey: undefined,
    vapidSubject: 'mailto:test@example.com',
    reminderSweepMs: 30_000,
  },
  pushEnabled: false,
}));

import { createApp } from '../src/app';
import { BrokenHistoryError, HistoryStore } from '../src/store';
import { WsHub } from '../src/ws';

const PW = 'hunter2222';
const ALICE = 'alice';
const BOB = 'bob';

const add = (id: string, parentId = ROOT_ID): Operation => ({ kind: 'add', parentId, id, name: id, weight: 1 });

/** Seed rows directly (bypassing submit): a legacy complete the rules now reject. */
async function seedBroken(name: string): Promise<void> {
  const userId = await seedUser(name);
  const nodes: HistoryNode[] = [
    { id: 'h1', op: add('a') },
    { id: 'h2', op: add('b', 'a') },
    { id: 'h3', op: { kind: 'complete', id: 'a' } },
  ];
  let parent: string | null = null;
  for (const node of nodes) {
    await prismaMock.historyNode.create({ data: { userId, opId: node.id, parentOpId: parent, op: node.op } });
    parent = node.id;
  }
  await prismaMock.user.update({ where: { id: userId }, data: { headOpId: 'h3' } });
}

describe('broken histories', () => {
  beforeEach(() => resetDb());

  it('load marks the user broken instead of failing, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedBroken(ALICE);
    await seedUser(BOB);
    const store = new HistoryStore();
    await store.load();
    expect(log).toHaveBeenCalledWith(expect.stringContaining(ALICE));
    expect(log.mock.calls[0][0]).toContain('h3');
    // the history stays readable — that is what a repair rewrites from
    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1', 'h2', 'h3']);
    log.mockRestore();
  });

  it('rejects tree access and submits for a broken user', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedBroken(ALICE);
    const store = new HistoryStore();
    await store.load();
    await expect(store.getTreeForUser(ALICE)).rejects.toBeInstanceOf(BrokenHistoryError);
    await expect(store.appendBatch(ALICE, [{ kind: 'add', id: 'h4', op: add('c') }])).rejects.toBeInstanceOf(
      BrokenHistoryError,
    );
    log.mockRestore();
  });

  it('leaves healthy users unaffected and skips broken ones in allUserTrees', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedBroken(ALICE);
    const bobId = await seedUser(BOB);
    const store = new HistoryStore();
    await store.load();
    await store.appendBatch(BOB, [{ kind: 'add', id: 'x1', op: add('x') }]);
    expect((await store.getTreeForUser(BOB)).tree.nodeCount()).toBe(1);
    expect(store.allUserTrees().map((u) => u.userId)).toEqual([bobId]);
    log.mockRestore();
  });

  it('a rewrite repairs the user and submissions work again', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await seedBroken(ALICE);
    const store = new HistoryStore();
    await store.load();
    // drop h3 (the invalid complete) — exactly what planDropRepair produces
    await store.replace(ALICE, 'h3', [
      { id: 'h1', op: add('a') },
      { id: 'h2', op: add('b', 'a') },
    ]);
    expect((await store.getTreeForUser(ALICE)).tree.getNode('a')?.status).toBe(false);
    await store.appendBatch(ALICE, [{ kind: 'add', id: 'h4', op: add('c') }]);
    expect((await store.getTreeForUser(ALICE)).tree.nodeCount()).toBe(3);
    expect(store.allUserTrees()).toHaveLength(1);
    log.mockRestore();
  });

  it('submit answers 409 with the failing entry, and a rewrite unblocks it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hub = new WsHub(http.createServer());
    const bootstrap = createApp({ store: new HistoryStore(), hub });
    const registered = await request(bootstrap)
      .post('/api/register')
      .send({ username: ALICE, password: PW });
    expect(registered.status).toBe(201);
    const token: string = registered.body.token;
    await seedBroken(ALICE);

    const store = new HistoryStore();
    await store.load();
    const app = createApp({ store, hub });

    const submit = await request(app)
      .post('/api/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ htrop: [{ kind: 'add', id: 'h4', op: add('c') }] });
    expect(submit.status).toBe(409);
    expect(submit.body.entry_id).toBe('h3');
    expect(submit.body.reason).toContain('child "b" is not completed');

    const rewrite = await request(app)
      .post('/api/rewrite')
      .set('Authorization', `Bearer ${token}`)
      .send({
        base: 'h3',
        history: [
          { id: 'h1', op: add('a') },
          { id: 'h2', op: add('b', 'a') },
        ],
      });
    expect(rewrite.status).toBe(200);

    const after = await request(app)
      .post('/api/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ htrop: [{ kind: 'add', id: 'h4', op: add('c') }] });
    expect(after.status).toBe(200);
    log.mockRestore();
  });
});
