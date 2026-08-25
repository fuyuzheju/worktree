import os from 'node:os';
import readline from 'node:readline';
import type { AuthResponse } from '@worktree/core';
import type { StoredToken } from './storage';

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authFetch(serverUrl: string, path: string, body: object, token?: string): Promise<AuthResponse> {
  const res = await fetch(serverUrl.replace(/\/+$/, '') + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const parsed = (await res.json()) as { error?: string };
      if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // non-JSON error body
    }
    throw new AuthError(res.status, message);
  }
  return (await res.json()) as AuthResponse;
}

export async function registerOnServer(serverUrl: string, username: string, password: string): Promise<StoredToken> {
  const auth = await authFetch(serverUrl, '/api/register', { username, password });
  return { token: auth.token, tokenId: auth.tokenId };
}

export async function loginOnServer(
  serverUrl: string,
  username: string,
  password: string,
  label?: string,
): Promise<StoredToken> {
  const auth = await authFetch(serverUrl, '/api/login', { username, password, label });
  return { token: auth.token, tokenId: auth.tokenId, label };
}

/** Best-effort server-side revocation; throws on network failure (token stays active). */
export async function revokeOnServer(serverUrl: string, token: string): Promise<void> {
  const res = await fetch(serverUrl.replace(/\/+$/, '') + '/api/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new AuthError(res.status, `HTTP ${res.status}`);
}

export function defaultLabel(): string {
  return `${os.hostname()} (cli)`;
}

/**
 * Password prompt with hidden echo. Interactive: readline raw mode disables
 * terminal echo; the re-echo goes through _writeToOutput, which is silenced.
 * Non-TTY: falls back to the WORKTREE_PASSWORD env var (for scripts).
 */
export async function promptPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const env = process.env.WORKTREE_PASSWORD;
    if (env === undefined) {
      throw new Error('password required — run interactively or set WORKTREE_PASSWORD');
    }
    return env;
  }
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('aborted'));
    });
  });
}
