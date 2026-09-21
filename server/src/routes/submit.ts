import { Router } from 'express';
import type { SubmitRequest } from '@worktree/core';
import { BrokenHistoryError, DuplicateOpError, HeadUndoError, ValidationError } from '../store';
import type { HistoryStore } from '../store';
import type { WsHub } from '../ws';

export function submitRouter(store: HistoryStore, hub: WsHub): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const body: SubmitRequest | undefined = req.body;
    const htrop = body?.htrop;
    if (!Array.isArray(htrop) || htrop.length === 0) {
      res.status(400).json({ error: 'htrop must be a non-empty array' });
      return;
    }

    try {
      const user: string = res.locals.user;
      const { added, removed } = await store.appendBatch(user, htrop);
      for (const node of added) hub.broadcastTo(user, { type: 'op', node });
      for (const id of removed) hub.broadcastTo(user, { type: 'removed', id });
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof ValidationError) {
        res.status(400).json({ conflict_id: e.opId, reason: e.message });
        return;
      }
      if (e instanceof DuplicateOpError || e instanceof HeadUndoError) {
        res.status(400).json({ conflict_id: e.id, reason: e.message });
        return;
      }
      // The user's stored history no longer replays: only a rewrite repairs it.
      if (e instanceof BrokenHistoryError) {
        res.status(409).json({ error: e.message, entry_id: e.entryId, reason: e.reason });
        return;
      }
      throw e;
    }
  });

  return router;
}
