import fs from 'node:fs';
import path from 'node:path';
import type { ClientStorage, SavedState } from '@worktree/client';
import { USER_RE, isRecord } from '@worktree/core';

/**
 * File-backed ClientStorage. Saves are atomic (tmp + rename) so a crash
 * mid-write cannot corrupt the archive; a corrupt file on load is preserved
 * as `<path>.corrupt-<ts>` instead of being silently discarded.
 */
export class FileStorage implements ClientStorage {
  constructor(private filePath: string) {}

  load(): SavedState | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
      console.error(`failed to read ${this.filePath}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) throw new Error('invalid shape');
      if (!Array.isArray(parsed.confirmed) || !Array.isArray(parsed.pending)) throw new Error('invalid shape');
      return { confirmed: parsed.confirmed, pending: parsed.pending };
    } catch (e) {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.filePath, backup);
        console.error(`state file was corrupt — moved to ${backup}`);
      } catch (renameErr) {
        console.error(`state file was corrupt and could not be moved: ${renameErr}`);
      }
      return null;
    }
  }

  save(state: SavedState): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch (e) {
      console.error(`failed to save state to ${this.filePath}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function worktreeHome(): string {
  return path.join(process.env.HOME ?? process.cwd(), '.worktree');
}

/** `~/.worktree/<server-host>` — the per-server storage root. */
export function userStateRoot(serverUrl: string): string {
  const host = new URL(serverUrl).host.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(worktreeHome(), host);
}

/**
 * `~/.worktree/<server-host>/<userId>/state.json` — namespaced per server and
 * user so different servers and users never share history.
 * The reserved user `local` is device-local: `~/.worktree/local/state.json`,
 * independent of the server (its data never leaves this machine).
 */
export function defaultStatePath(serverUrl: string, userId: string): string {
  if (userId === 'local') return path.join(worktreeHome(), 'local', 'state.json');
  const sanitized = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(userStateRoot(serverUrl), sanitized, 'state.json');
}

/** `~/.worktree/<server-host>/current-user` — the user to resume after a restart. */
export function currentUserPath(serverUrl: string): string {
  return path.join(userStateRoot(serverUrl), 'current-user');
}

export function readCurrentUser(serverUrl: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(currentUserPath(serverUrl), 'utf8').trim();
  } catch {
    return null;
  }
  return USER_RE.test(raw) ? raw : null;
}

export function writeCurrentUser(serverUrl: string, user: string): void {
  try {
    fs.mkdirSync(path.dirname(currentUserPath(serverUrl)), { recursive: true });
    fs.writeFileSync(currentUserPath(serverUrl), `${user}\n`);
  } catch (e) {
    console.error(`failed to save current user: ${e instanceof Error ? e.message : e}`);
  }
}

/** A device token as issued by register/login. */
export interface StoredToken {
  token: string;
  tokenId: number;
  label?: string;
}

/** `~/.worktree/<server-host>/<userId>/token.json` — a credential, kept 0600. */
export function tokenPath(serverUrl: string, userId: string): string {
  const sanitized = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(userStateRoot(serverUrl), sanitized, 'token.json');
}

export function readToken(serverUrl: string, userId: string): StoredToken | null {
  let raw: string;
  try {
    raw = fs.readFileSync(tokenPath(serverUrl, userId), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.token !== 'string' || parsed.token.length === 0 || typeof parsed.tokenId !== 'number') {
      return null;
    }
    return {
      token: parsed.token,
      tokenId: parsed.tokenId,
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
    };
  } catch {
    return null;
  }
}

/** Writes the token with mode 0600 — the tmp file is chmodded before the rename. */
export function writeToken(serverUrl: string, userId: string, stored: StoredToken): void {
  const filePath = tokenPath(serverUrl, userId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stored, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

export function deleteToken(serverUrl: string, userId: string): void {
  try {
    fs.rmSync(tokenPath(serverUrl, userId), { force: true });
  } catch (e) {
    console.error(`failed to delete token: ${e instanceof Error ? e.message : e}`);
  }
}
