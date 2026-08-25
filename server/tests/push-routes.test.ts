import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { prismaMock, resetDb } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));
vi.mock('../src/config', () => ({
  config: {
    port: 9997,
    databaseUrl: 'file:./dev.db',
    registrationMode: 'open',
    vapidPublicKey: 'public-key-123',
    vapidPrivateKey: 'private-key-456',
    vapidSubject: 'mailto:test@example.com',
    reminderSweepMs: 30_000,
  },
  pushEnabled: true,
}));

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
  return res.body as { username: string; token: string };
}

const SUB = { endpoint: 'https://push.example/endpoint-1', keys: { p256dh: 'P256DH', auth: 'AUTH' } };

describe('push routes (enabled)', () => {
  beforeEach(() => resetDb());

  it('requires a bearer token', async () => {
    const app = makeApp();
    const res = await request(app).get('/api/push/vapid-key');
    expect(res.status).toBe(401);
  });

  it('GET /api/push/vapid-key returns the public key', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    const res = await request(app).get('/api/push/vapid-key').set('Authorization', `Bearer ${auth.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pushEnabled: true, publicKey: 'public-key-123' });
  });

  it('POST /api/push/subscribe stores the subscription', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${auth.token}`)
      .send(SUB);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const user = await prismaMock.user.findUnique({ where: { name: 'alice' } });
    const subs = await prismaMock.pushSubscription.findMany({ where: { userId: user!.id } });
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ endpoint: SUB.endpoint, p256dh: 'P256DH', auth: 'AUTH' });
  });

  it('re-subscribing the same endpoint reassigns it to the new user', async () => {
    const app = makeApp();
    const alice = await register(app, 'alice');
    await request(app).post('/api/push/subscribe').set('Authorization', `Bearer ${alice.token}`).send(SUB);
    const bob = await register(app, 'bob');
    const res = await request(app).post('/api/push/subscribe').set('Authorization', `Bearer ${bob.token}`).send(SUB);
    expect(res.status).toBe(200);
    const rows = await prismaMock.pushSubscription.findMany({ where: {} });
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe(SUB.endpoint);
    const bobUser = await prismaMock.user.findUnique({ where: { name: 'bob' } });
    expect(rows[0].userId).toBe(bobUser!.id);
  });

  it('rejects a malformed subscription body with 400', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    for (const body of [
      {},
      { endpoint: SUB.endpoint },
      { endpoint: SUB.endpoint, keys: { p256dh: 'x' } },
      { endpoint: '   ', keys: { p256dh: 'x', auth: 'y' } },
      { endpoint: SUB.endpoint, keys: { p256dh: 'x', auth: '' } },
      { endpoint: 'x'.repeat(513), keys: { p256dh: 'x', auth: 'y' } },
    ]) {
      const res = await request(app).post('/api/push/subscribe').set('Authorization', `Bearer ${auth.token}`).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('DELETE /api/push/subscribe is idempotent', async () => {
    const app = makeApp();
    const auth = await register(app, 'alice');
    await request(app).post('/api/push/subscribe').set('Authorization', `Bearer ${auth.token}`).send(SUB);
    const first = await request(app).delete('/api/push/subscribe').set('Authorization', `Bearer ${auth.token}`).send({ endpoint: SUB.endpoint });
    expect(first.status).toBe(200);
    const second = await request(app).delete('/api/push/subscribe').set('Authorization', `Bearer ${auth.token}`).send({ endpoint: SUB.endpoint });
    expect(second.status).toBe(200);
    const user = await prismaMock.user.findUnique({ where: { name: 'alice' } });
    expect(await prismaMock.pushSubscription.findMany({ where: { userId: user!.id } })).toEqual([]);
  });

  it('does not delete another user\'s subscription', async () => {
    const app = makeApp();
    const alice = await register(app, 'alice');
    const bob = await register(app, 'bob');
    await request(app).post('/api/push/subscribe').set('Authorization', `Bearer ${alice.token}`).send(SUB);
    const res = await request(app).delete('/api/push/subscribe').set('Authorization', `Bearer ${bob.token}`).send({ endpoint: SUB.endpoint });
    expect(res.status).toBe(200);
    const user = await prismaMock.user.findUnique({ where: { name: 'alice' } });
    expect(await prismaMock.pushSubscription.findMany({ where: { userId: user!.id } })).toHaveLength(1);
  });
});
