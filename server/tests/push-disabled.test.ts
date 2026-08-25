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

describe('push routes (disabled)', () => {
  beforeEach(() => resetDb());

  async function registerAndGetToken(app: ReturnType<typeof createApp>) {
    const res = await request(app).post('/api/register').send({ username: 'alice', password: PW });
    expect(res.status).toBe(201);
    return (res.body as { token: string }).token;
  }

  it('reports push disabled and rejects subscribe with 503', async () => {
    const store = new HistoryStore();
    const hub = new WsHub(http.createServer());
    const app = createApp({ store, hub });
    const token = await registerAndGetToken(app);

    const keyRes = await request(app).get('/api/push/vapid-key').set('Authorization', `Bearer ${token}`);
    expect(keyRes.status).toBe(200);
    expect(keyRes.body).toEqual({ pushEnabled: false });

    const subRes = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } });
    expect(subRes.status).toBe(503);
    expect(subRes.body).toEqual({ error: 'push disabled' });
  });
});
