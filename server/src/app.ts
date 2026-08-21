import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { offlineGuard } from './state';
import type { HistoryStore } from './store';
import type { WsHub } from './ws';
import { submitRouter } from './routes/submit';
import { historyRouter } from './routes/history';
import { statsRouter } from './routes/stats';
import { rewriteRouter } from './routes/rewrite';
import { userMiddleware } from './user';

export interface AppContext {
  store: HistoryStore;
  hub: WsHub;
}

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());
  // Identity resolution comes before every router — including /rewrite.
  app.use(userMiddleware);

  // /rewrite is mounted before the offline guard: it triggers offline mode
  // itself while it edits the database.
  app.use('/rewrite', rewriteRouter(ctx.store));

  app.use(offlineGuard);
  app.use('/submit', submitRouter(ctx.store, ctx.hub));
  app.use('/history', historyRouter(ctx.store));
  app.use('/stats', statsRouter(ctx.store));

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  };
  app.use(errorHandler);

  return app;
}
