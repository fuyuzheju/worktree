import { Router } from 'express';
import { getState } from '../state';
import type { HistoryStore } from '../store';

export function statsRouter(store: HistoryStore): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const user = res.locals.user as string;
    const tree = await store.getTreeForUser(user);
    res.json({
      opCount: (await store.all(user)).length,
      nodeCount: tree.nodeCount(),
      reminderCount: tree.reminderCount(),
      state: getState(user),
    });
  });

  return router;
}
