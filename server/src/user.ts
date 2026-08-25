import type { NextFunction, Request, Response } from 'express';
import { USER_RE } from '@worktree/core';
import { resolveToken, touchToken } from './auth';

export function parseUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return USER_RE.test(value) ? value : null;
}

export function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(header);
  return m ? m[1] : null;
}

/** Resolves the bearer token into res.locals.user / userId / tokenId. */
export async function userMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = parseBearerToken(req.header('authorization'));
  const resolved = token === null ? null : await resolveToken(token);
  if (resolved === null) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.locals.user = resolved.username;
  res.locals.userId = resolved.userId;
  res.locals.tokenId = resolved.tokenId;
  void touchToken(resolved.tokenId, resolved.lastUsedAt);
  next();
}
