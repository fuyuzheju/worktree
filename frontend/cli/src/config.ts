import { USER_RE } from '@worktree/core';
import { readCurrentUser, writeCurrentUser } from './storage';

export const DEFAULT_SERVER = process.env.WORKTREE_SERVER ?? 'https://worktree.fuyuzheju.cn';
/** Reserved client-side-only user: offline, never talks to the server. */
export const LOCAL_USER = 'local';

/**
 * The user to start as: WORKTREE_USER env (explicit per-invocation intent)
 * beats the persisted last-used user, which beats the local user.
 */
export function loadCurrentUser(): string {
  const env = process.env.WORKTREE_USER;
  if (env !== undefined && USER_RE.test(env)) return env;
  return readCurrentUser(DEFAULT_SERVER) ?? LOCAL_USER;
}

export function saveCurrentUser(name: string): void {
  writeCurrentUser(DEFAULT_SERVER, name);
}
