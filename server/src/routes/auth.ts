import { Router } from 'express';
import type { LoginRequest, RegisterRequest } from '@worktree/core';
import { LABEL_MAX_LEN, PASSWORD_MAX_LEN, PASSWORD_MIN_LEN, UsernameTakenError } from '../auth';
import { listTokens, loginUser, registerUser, revokeToken } from '../auth';
import type { RegistrationGate } from '../registration';
import { parseUsername } from '../user';

function readPassword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < PASSWORD_MIN_LEN || value.length > PASSWORD_MAX_LEN) return null;
  return value;
}

function readLabel(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const label = value.trim();
  if (label.length === 0) return null;
  return label.length <= LABEL_MAX_LEN ? label : null;
}

/** register/login — mounted at /api before the auth middleware. */
export function publicAuthRouter(gate: RegistrationGate): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const body = req.body as RegisterRequest | undefined;
    const username = parseUsername(body?.username);
    if (username === null) {
      res.status(400).json({ error: 'invalid username' });
      return;
    }
    const password = readPassword(body?.password);
    if (password === null) {
      res.status(400).json({ error: `password must be ${PASSWORD_MIN_LEN}-${PASSWORD_MAX_LEN} characters` });
      return;
    }
    if (body?.inviteCode !== undefined && (typeof body.inviteCode !== 'string' || body.inviteCode.length > 100)) {
      res.status(400).json({ error: 'invalid invite code' });
      return;
    }

    const decision = gate.check(username, body?.inviteCode);
    if (!decision.ok) {
      // `invite` mode maps these to 403 with the reason; nothing to do while
      // the only gate is open registration.
      res.status(403).json({ error: decision.reason });
      return;
    }

    try {
      const auth = await registerUser(username, password);
      res.status(201).json(auth);
    } catch (e) {
      if (e instanceof UsernameTakenError) {
        res.status(409).json({ error: 'username taken' });
        return;
      }
      throw e;
    }
  });

  router.post('/login', async (req, res) => {
    const body = req.body as LoginRequest | undefined;
    const username = parseUsername(body?.username);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (username === null || password.length === 0 || password.length > PASSWORD_MAX_LEN) {
      res.status(401).json({ error: 'invalid username or password' });
      return;
    }
    const auth = await loginUser(username, password, readLabel(body?.label));
    if (auth === null) {
      res.status(401).json({ error: 'invalid username or password' });
      return;
    }
    res.json(auth);
  });

  return router;
}

/** logout/tokens — mounted at /api after the auth middleware. */
export function authedAuthRouter(): Router {
  const router = Router();

  router.post('/logout', async (_req, res) => {
    await revokeToken(res.locals.userId as number, res.locals.tokenId as number);
    res.json({ ok: true });
  });

  router.get('/tokens', async (_req, res) => {
    const tokens = await listTokens(res.locals.userId as number);
    res.json({
      tokens: tokens.map((t) => ({
        id: t.id,
        label: t.label,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        current: t.id === (res.locals.tokenId as number),
      })),
    });
  });

  router.delete('/tokens/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const revoked = await revokeToken(res.locals.userId as number, id);
    if (!revoked) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
