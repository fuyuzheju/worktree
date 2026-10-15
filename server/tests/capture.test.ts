import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
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
import { getState, setState } from '../src/state';
import { HistoryStore } from '../src/store';
import { WsHub } from '../src/ws';

const PW = 'hunter2222';
const ALICE = 'alice';

const add = (id: string, parentId = ROOT_ID, name = id): Operation => ({
  kind: 'add',
  parentId,
  id,
  name,
  weight: 1,
});

interface Ctx {
  app: Express;
  store: HistoryStore;
  hub: WsHub;
}

function makeApp(): Ctx {
  const store = new HistoryStore();
  const hub = new WsHub(http.createServer());
  return { app: createApp({ store, hub }), store, hub };
}

async function register(app: Express): Promise<string> {
  const res = await request(app).post('/api/register').send({ username: ALICE, password: PW });
  expect(res.status).toBe(201);
  const token: string = res.body.token;
  return token;
}

function capture(app: Express, token: string, body: object) {
  return request(app).post('/api/capture').set('Authorization', `Bearer ${token}`).send(body);
}

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

describe('POST /api/capture', () => {
  beforeEach(() => {
    resetDb();
    setState(ALICE, 'working');
  });

  it('requires a bearer token', async () => {
    const { app } = makeApp();
    expect((await request(app).post('/api/capture').send({ text: 'x' })).status).toBe(401);
  });

  it('creates /tmp and the node, broadcasting the appended ops', async () => {
    const { app, store, hub } = makeApp();
    const spy = vi.spyOn(hub, 'broadcastTo');
    const token = await register(app);

    const res = await capture(app, token, { id: 'cap-1', text: 'buy milk\nafter work' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, nodeId: 'cap-1', displayPath: '/tmp/buy milk' });

    const nodes = await store.all(ALICE);
    expect(nodes).toHaveLength(2);
    // An entry's id doubles as its node id, so the retry key addresses both.
    expect(nodes.map((n) => (n.op.kind === 'add' ? n.op.name : ''))).toEqual(['tmp', 'buy milk']);
    expect(nodes[1].id).toBe('cap-1');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.every(([user]) => user === ALICE)).toBe(true);

    const state = await store.getTreeForUser(ALICE);
    const tmp = state.tree.getRoot().children[0];
    expect(tmp.name).toBe('tmp');
    const node = tmp.children[0];
    expect(node.name).toBe('buy milk');
    expect(node.note).toBe('after work');
    expect(node.weight).toBe(0); // top of an empty /tmp
  });

  it('is idempotent when retried with the same id', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    const first = await capture(app, token, { id: 'cap-1', text: 'x' });
    expect(first.status).toBe(200);
    const retry = await capture(app, token, { id: 'cap-1', text: 'x' });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ ok: true, nodeId: 'cap-1', displayPath: '/tmp/x' });
    expect(await store.all(ALICE)).toHaveLength(2);
  });

  it('suffixes a repeated capture instead of failing', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    await capture(app, token, { id: 'c1', text: 'todo' });
    const second = await capture(app, token, { id: 'c2', text: 'todo' });
    expect(second.status).toBe(200);
    expect(second.body.displayPath).toBe('/tmp/todo (2)');
    expect(await store.all(ALICE)).toHaveLength(3);
  });

  it('converges two concurrent captures of the same text to X and X (2)', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    const [a, b] = await Promise.all([
      capture(app, token, { id: 'c1', text: 'race' }),
      capture(app, token, { id: 'c2', text: 'race' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const paths = [a.body.displayPath, b.body.displayPath].sort();
    expect(paths).toEqual(['/tmp/race', '/tmp/race (2)']);
    expect(await store.all(ALICE)).toHaveLength(3);
  });

  it('rejects a bad body, bad text and bad path with 400 and appends nothing', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    expect((await capture(app, token, {})).status).toBe(400);
    expect((await capture(app, token, { id: 'c1', text: '' })).status).toBe(400);
    expect((await capture(app, token, { id: 'c1', text: 'a/b' })).status).toBe(400);
    expect((await capture(app, token, { id: 'c1', text: 'x', path: 'tmp' })).status).toBe(400);
    expect((await capture(app, token, { id: 'c1', text: 'x', path: '/a/../b' })).status).toBe(400);
    expect((await capture(app, token, { id: 7, text: 'x' })).status).toBe(400);

    expect(await store.all(ALICE)).toEqual([]);
  });

  it('generates an id when omitted', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    const res = await capture(app, token, { text: 'no id' });
    expect(res.status).toBe(200);
    expect(typeof res.body.nodeId).toBe('string');
    expect(res.body.displayPath).toBe('/tmp/no id');
    expect(await store.all(ALICE)).toHaveLength(2);
  });

  it('rejects a reused non-capture entry id with 409', async () => {
    const { app } = makeApp();
    const token = await register(app);
    await request(app)
      .post('/api/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ htrop: [{ kind: 'add', id: 'h1', op: add('a') }, { kind: 'add', id: 'h2', op: { kind: 'rename', id: 'a', name: 'A' } }] });

    const res = await capture(app, token, { id: 'h2', text: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('not a capture');
  });

  it('honors a custom path', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    const res = await capture(app, token, { id: 'c1', text: 'x', path: '/a/b' });
    expect(res.status).toBe(200);
    expect(res.body.displayPath).toBe('/a/b/x');
    expect((await store.all(ALICE)).map((n) => n.op.kind)).toEqual(['add', 'add', 'add']);
  });

  it('is rejected with 503 while the user is offline', async () => {
    const { app } = makeApp();
    const token = await register(app);
    setState(ALICE, 'offline');

    const res = await capture(app, token, { text: 'x' });
    expect(res.status).toBe(503);
    setState(ALICE, 'working');
    expect(getState(ALICE)).toBe('working');
  });

  it('responds 409 for a broken history, both fresh and on retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hub = new WsHub(http.createServer());
    const bootstrap = createApp({ store: new HistoryStore(), hub });
    const registered = await request(bootstrap)
      .post('/api/register')
      .send({ username: ALICE, password: PW });
    const token: string = registered.body.token;
    await seedBroken(ALICE);
    const store = new HistoryStore();
    await store.load();
    const app = createApp({ store, hub });

    const fresh = await capture(app, token, { id: 'c1', text: 'x' });
    expect(fresh.status).toBe(409);
    expect(fresh.body.entry_id).toBe('h3');
    expect(fresh.body.reason).toContain('child "b" is not completed');
    const retry = await capture(app, token, { id: 'h1', text: 'x' });
    expect(retry.status).toBe(409);
    log.mockRestore();
  });
});
