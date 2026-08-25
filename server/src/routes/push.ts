import { Router } from 'express';
import { config, pushEnabled } from '../config';
import { prisma } from '../db';

const MAX_ENDPOINT_LEN = 512;
const MAX_KEY_LEN = 256;

function readString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 && s.length <= maxLen ? s : null;
}

interface SubscribeBody {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
}

/** Push subscription management — mounted at /api/push after the auth
 *  middleware but before the offline guard (offline users still manage
 *  their subscriptions). */
export function pushRouter(): Router {
  const router = Router();

  router.get('/vapid-key', (_req, res) => {
    if (!pushEnabled) {
      res.json({ pushEnabled: false });
      return;
    }
    res.json({ pushEnabled: true, publicKey: config.vapidPublicKey });
  });

  router.post('/subscribe', async (req, res) => {
    if (!pushEnabled) {
      res.status(503).json({ error: 'push disabled' });
      return;
    }
    const body = req.body as SubscribeBody | undefined;
    const endpoint = readString(body?.endpoint, MAX_ENDPOINT_LEN);
    const p256dh = readString(body?.keys?.p256dh, MAX_KEY_LEN);
    const auth = readString(body?.keys?.auth, MAX_KEY_LEN);
    if (endpoint === null || p256dh === null || auth === null) {
      res.status(400).json({ error: 'invalid subscription' });
      return;
    }
    const userId = res.locals.userId as number;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh, auth, userId },
      update: { p256dh, auth, userId, lastUsedAt: new Date() },
    });
    res.json({ ok: true });
  });

  router.delete('/subscribe', async (req, res) => {
    const endpoint = readString((req.body as { endpoint?: unknown } | undefined)?.endpoint, MAX_ENDPOINT_LEN);
    if (endpoint === null) {
      res.status(400).json({ error: 'invalid subscription' });
      return;
    }
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: res.locals.userId as number },
    });
    res.json({ ok: true });
  });

  return router;
}
