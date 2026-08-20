import { Router } from 'express';
import { getState } from '../state';
import type { HistoryStore } from '../store';

export function statsRouter(store: HistoryStore): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const tree = store.getTree();
    res.json({
      opCount: (await store.all()).length,
      nodeCount: tree.nodeCount(),
      reminderCount: tree.reminderCount(),
      state: getState(),
    });
  });

  return router;
}
