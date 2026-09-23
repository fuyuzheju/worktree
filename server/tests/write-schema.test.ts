import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { ROOT_ID } from '@worktree/core';
import type { HistoryOperation, Operation } from '@worktree/core';
import { prismaMock, resetDb } from './helpers/prismaMock';

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
import { HistoryStore } from '../src/store';
import { WsHub } from '../src/ws';

const PW = 'hunter2222';
const ALICE = 'alice';

function makeApp(): { app: Express; store: HistoryStore } {
  const store = new HistoryStore();
  const hub = new WsHub(http.createServer());
  return { app: createApp({ store, hub }), store };
}

async function register(app: Express): Promise<string> {
  const res = await request(app).post('/api/register').send({ username: ALICE, password: PW });
  expect(res.status).toBe(201);
  const token: string = res.body.token;
  return token;
}

const add = (): Operation => ({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'a', weight: 1 });

/** Applies to the tree but fails the op schema: a fractional deadline, the
 *  shape auto-reminders used to compute before they rounded. */
const fractionalReminder = (): Operation => ({
  kind: 'add_reminder',
  nodeId: 'a',
  rmdId: 'r1',
  deadline: 1000.5,
});

/** Fails the op schema: tzOffset must be whole minutes. */
const fractionalRule = (): Operation => ({
  kind: 'add_block_rule',
  id: 'r1',
  name: 'standup',
  freq: 'weekly',
  interval: 1,
  startDate: { year: 2026, month: 9, day: 23 },
  timeOfDay: { hour: 9, minute: 0 },
  duration: 3_600_000,
  tzOffset: 1000.5,
});

function submit(app: Express, token: string, htrop: HistoryOperation[]) {
  return request(app).post('/api/submit').set('Authorization', `Bearer ${token}`).send({ htrop });
}

describe('write schema validation', () => {
  beforeEach(() => resetDb());

  it('submit rejects an unreadable op with 400 and appends nothing', async () => {
    const { app, store } = makeApp();
    const token = await register(app);
    expect((await submit(app, token, [{ kind: 'add', id: 'h1', op: add() }])).status).toBe(200);

    const bad = await submit(app, token, [{ kind: 'add', id: 'h2', op: fractionalReminder() }]);
    expect(bad.status).toBe(400);
    expect(bad.body.conflict_id).toBe('h2');
    expect(bad.body.reason).toContain('op schema');

    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
  });

  it('rejects a rule with a fractional tz offset with 400 and appends nothing', async () => {
    const { app, store } = makeApp();
    const token = await register(app);

    const bad = await submit(app, token, [{ kind: 'add', id: 'h1', op: fractionalRule() }]);
    expect(bad.status).toBe(400);
    expect(bad.body.conflict_id).toBe('h1');
    expect(bad.body.reason).toContain('op schema');

    expect(await store.all(ALICE)).toEqual([]);
  });

  it('rewrite rejects a history with an unreadable op with 400 and keeps the stored one', async () => {
    const { app, store } = makeApp();
    const token = await register(app);
    await submit(app, token, [{ kind: 'add', id: 'h1', op: add() }]);

    const bad = await request(app)
      .post('/api/rewrite')
      .set('Authorization', `Bearer ${token}`)
      .send({
        base: 'h1',
        history: [
          { id: 'h1', op: add() },
          { id: 'h2', op: fractionalReminder() },
        ],
      });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('op schema');

    expect((await store.all(ALICE)).map((n) => n.id)).toEqual(['h1']);
  });
});
