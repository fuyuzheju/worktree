import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prismaMock, resetDb } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import { createApp } from '../src/app';
import { HistoryStore } from '../src/store';
import { WsHub } from '../src/ws';

const PW = 'hunter2222';

function makeApp() {
  // Both the store and the routes hit the shared in-memory prismaMock, so a
  // real HistoryStore works here. WsHub only needs an http.Server instance
  // for the upgrade listener — supertest drives the app without listening.
  const store = new HistoryStore();
  const hub = new WsHub(http.createServer());
  return createApp({ store, hub });
}

async function register(app: ReturnType<typeof makeApp>, username: string, password = PW) {
  const res = await request(app).post('/api/register').send({ username, password });
  expect(res.status).toBe(201);
  return res.body as { username: string; token: string; tokenId: number };
}

describe('POST /api/register', () => {
  beforeEach(() => resetDb());

  it('registers and the token works on authed endpoints', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    expect(auth.username).toBe('alice');
    const res = await request(app).get('/api/history').set('Authorization', `Bearer ${auth.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cursorFound: true, nodes: [] });
  });

  it('rejects a taken username with 409', async () => {
    const app = makeApp();
    await register(app, 'alice');
    const res = await request(app).post('/api/register').send({ username: 'alice', password: PW });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'username taken' });
  });

  it('rejects invalid usernames and passwords with 400', async () => {
    const app = makeApp();
    expect((await request(app).post('/api/register').send({ username: 'bad name!', password: PW })).status).toBe(400);
    expect((await request(app).post('/api/register').send({ username: 'alice', password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/register').send({ username: 'alice' })).status).toBe(400);
  });

  it('accepts and ignores a well-formed inviteCode (reserved for invite mode)', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/register').send({ username: 'alice', password: PW, inviteCode: 'x' });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/login', () => {
  beforeEach(async () => {
    resetDb();
    const app = makeApp();
    await register(app, 'alice');
  });

  it('returns a fresh token with device label', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/login').send({ username: 'alice', password: PW, label: 'my-phone' });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice');
    const tokens = await request(app)
      .get('/api/tokens')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(tokens.body.tokens).toHaveLength(2);
    expect(tokens.body.tokens.find((t: { label: string | null }) => t.label === 'my-phone')).toBeDefined();
  });

  it('401s identically for wrong password and unknown user', async () => {
    const app = makeApp();
    const wrong = await request(app).post('/api/login').send({ username: 'alice', password: 'wrong' });
    const unknown = await request(app).post('/api/login').send({ username: 'nobody', password: PW });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body).toEqual({ error: 'invalid username or password' });
  });
});

describe('authenticated endpoints', () => {
  let app: ReturnType<typeof makeApp>;
  let token: string;

  beforeEach(async () => {
    resetDb();
    app = makeApp();
    token = (await register(app, 'alice')).token;
  });

  it('401s without or with a bad token', async () => {
    for (const path of ['/api/history', '/api/rewrite']) {
      const missing = await request(app).get(path);
      expect(missing.status, path).toBe(401);
      const bad = await request(app).get(path).set('Authorization', 'Bearer bogus-token-value');
      expect(bad.status, path).toBe(401);
    }
    const submit = await request(app).post('/api/submit').send({ htrop: [] });
    expect(submit.status).toBe(401);
  });

  it('GET /api/tokens lists devices with current flag', async () => {
    const second = (await request(app).post('/api/login').send({ username: 'alice', password: PW })).body;
    const res = await request(app).get('/api/tokens').set('Authorization', `Bearer ${second.token}`);
    expect(res.status).toBe(200);
    const tokens: Array<{ id: number; current: boolean }> = res.body.tokens;
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.current)).toHaveLength(1);
    const current = tokens.find((t) => t.current);
    if (current === undefined) throw new Error('no current token');
    expect(current.id).toBe(second.tokenId);
  });

  it('DELETE /api/tokens/:id revokes a device; the old token 401s afterwards', async () => {
    const first = (await request(app).get('/api/tokens').set('Authorization', `Bearer ${token}`)).body;
    const del = await request(app).delete(`/api/tokens/${first.tokens[0].id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const after = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it('DELETE /api/tokens/:id 404s for another user\'s token or a bogus id', async () => {
    await register(app, 'bob');
    const bobTokens = (
      await request(app)
        .get('/api/tokens')
        .set('Authorization', `Bearer ${(await request(app).post('/api/login').send({ username: 'bob', password: PW })).body.token}`)
    ).body;
    const res = await request(app)
      .delete(`/api/tokens/${bobTokens.tokens[0].id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect((await request(app).delete('/api/tokens/99999').set('Authorization', `Bearer ${token}`)).status).toBe(404);
  });

  it('POST /api/logout revokes the presented token', async () => {
    const res = await request(app).post('/api/logout').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const after = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });

  it('an unauthenticated probe cannot learn a user\'s offline state (401 before 503)', async () => {
    const res = await request(app).post('/api/submit').send({ htrop: [] });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});
