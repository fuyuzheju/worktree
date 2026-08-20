import type { NextFunction, Request, Response } from 'express';
import type { ServerState } from '@worktree/core';

let state: ServerState = 'working';
const listeners: Array<(state: ServerState) => void> = [];

export function getState(): ServerState {
  return state;
}

export function setState(next: ServerState): void {
  if (state === next) return;
  state = next;
  for (const l of [...listeners]) l(next);
}

export function onStateChange(cb: (state: ServerState) => void): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Rejects all requests with 503 while the server is offline. */
export function offlineGuard(_req: Request, res: Response, next: NextFunction): void {
  if (state === 'offline') {
    res.status(503).json({ error: 'server is offline' });
    return;
  }
  next();
}
