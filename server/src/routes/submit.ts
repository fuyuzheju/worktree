import { Router } from 'express';
import type { SubmitRequest } from '@worktree/core';
import { DuplicateOpError, HeadUndoError, ValidationError } from '../store';
import type { HistoryStore } from '../store';
import type { WsHub } from '../ws';

export function submitRouter(store: HistoryStore, hub: WsHub): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const htrop = (req.body as SubmitRequest | undefined)?.htrop;
    if (!Array.isArray(htrop) || htrop.length === 0) {
      res.status(400).json({ error: 'htrop must be a non-empty array' });
      return;
    }

    try {
      const { added, removed } = await store.appendBatch(htrop);
      for (const node of added) hub.broadcast({ type: 'op', node });
      for (const id of removed) hub.broadcast({ type: 'removed', id });
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
      throw e;
    }
  });

  return router;
}
