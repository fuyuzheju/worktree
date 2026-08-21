import type { NextFunction, Request, Response } from 'express';
import { USER_RE } from '@worktree/core';

export function parseUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return USER_RE.test(value) ? value : null;
}

/** Resolves the identity from the X-User header into res.locals.user. */
export function userMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = parseUsername(req.header('x-user'));
  if (user === null) {
    res.status(400).json({ error: 'missing or invalid X-User header' });
    return;
  }
  res.locals.user = user;
  next();
}
