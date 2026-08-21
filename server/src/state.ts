import type { NextFunction, Request, Response } from 'express';
import type { ServerState } from '@worktree/core';

/** Per-user lifecycle state; unknown users default to 'working'. */
const states = new Map<string, ServerState>();
const listeners: Array<(user: string, state: ServerState) => void> = [];

export function getState(user: string): ServerState {
  return states.get(user) ?? 'working';
}

export function setState(user: string, next: ServerState): void {
  const prev = getState(user);
  if (prev === next) return;
  if (next === 'working') {
    states.delete(user);
  } else {
    states.set(user, next);
  }
  for (const l of [...listeners]) l(user, next);
}

export function onStateChange(cb: (user: string, state: ServerState) => void): () => void {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Rejects a user's requests with 503 while that user is offline. */
export function offlineGuard(req: Request, res: Response, next: NextFunction): void {
  if (getState(res.locals.user as string) === 'offline') {
    res.status(503).json({ error: 'server is offline' });
    return;
  }
  next();
}
