import { Router } from 'express';
import { WorktreeState } from '@worktree/core';
import type { RewriteRequest } from '@worktree/core';
import { setState } from '../state';
import { BaseMismatchError } from '../store';
import type { HistoryStore } from '../store';

export function rewriteRouter(store: HistoryStore): Router {
  const router = Router();

  // Force-rewrite: take the user offline, replace their history, come back.
  // Rejected with 409 when the history advanced past the client's base.
  router.post('/', async (req, res) => {
    const body = req.body as RewriteRequest | undefined;
    const history = body?.history;
    const base = body?.base ?? null;
    const user = res.locals.user as string;
    if (!Array.isArray(history)) {
      res.status(400).json({ error: 'history must be an array' });
      return;
    }
    try {
      WorktreeState.fromOps(history.map((n) => n.op));
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
      return;
    }

    setState(user, 'offline');
    try {
      await store.replace(user, base, history);
    } catch (e) {
      if (e instanceof BaseMismatchError) {
        res.status(409).json({ error: e.message, head: e.headId });
        return;
      }
      throw e;
    } finally {
      setState(user, 'working');
    }
    res.json({ ok: true });
  });

  return router;
}
