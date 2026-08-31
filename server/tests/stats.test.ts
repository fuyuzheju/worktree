import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ROOT_ID } from '@worktree/core';
import { prismaMock, resetDb } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import { createApp } from '../src/app';
import { HistoryStore } from '../src/store';
import { WsHub } from '../src/ws';

const PW = 'hunter2222';

function makeApp() {
  const store = new HistoryStore();
  const hub = new WsHub(http.createServer());
  return createApp({ store, hub });
}

async function register(app: ReturnType<typeof makeApp>, username: string) {
  const res = await request(app).post('/api/register').send({ username, password: PW });
  expect(res.status).toBe(201);
  return res.body as { username: string; token: string; tokenId: number };
}

function submit(app: ReturnType<typeof makeApp>, token: string, ops: unknown[]) {
  return request(app)
    .post('/api/submit')
    .set('Authorization', `Bearer ${token}`)
    .send({ htrop: ops });
}

describe('GET /api/stats', () => {
  beforeEach(() => resetDb());

  it('reports counts for an empty user', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    const res = await request(app).get('/api/stats').set('Authorization', `Bearer ${auth.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ opCount: 0, nodeCount: 0, reminderCount: 0, blockCount: 0, state: 'working' });
  });

  it('includes blocks in the counts', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    await submit(app, auth.token, [
      { kind: 'add', id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } },
      { kind: 'add', id: 'h2', op: { kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10, nodeId: 'a' } },
    ]).expect(200);
    const res = await request(app).get('/api/stats').set('Authorization', `Bearer ${auth.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ opCount: 2, nodeCount: 1, reminderCount: 0, blockCount: 1, state: 'working' });
  });
});
