import { Router } from 'express';
import type { HistoryStore } from '../store';

export function historyRouter(store: HistoryStore): Router {
  const router = Router();

  // GET /history?id=<opId> — one entry
  // GET /history?after=<opId> — entries after the cursor (catch-up)
  // GET /history — the full history
  router.get('/', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    const after = typeof req.query.after === 'string' ? req.query.after : null;
    const user: string = res.locals.user;
    if (id !== null) {
      const node = await store.getById(user, id);
      if (!node) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json(node);
      return;
    }
    res.json(await store.since(user, after));
  });

  return router;
}
