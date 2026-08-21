import { defaultStatePath } from './storage';

export const DEFAULT_SERVER = process.env.WORKTREE_SERVER ?? 'http://localhost:3000';
export const WORKTREE_USER = process.env.WORKTREE_USER ?? 'default';
export const STATE_PATH = defaultStatePath(DEFAULT_SERVER, WORKTREE_USER);
