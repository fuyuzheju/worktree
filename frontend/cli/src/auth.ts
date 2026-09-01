import os from 'node:os';
import readline from 'node:readline';
import type { AuthResponse } from '@worktree/core';
import { isAuthResponse, isRecord } from '@worktree/core';
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
      const parsed: unknown = await res.json();
      if (isRecord(parsed) && typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // non-JSON error body
    }
    throw new AuthError(res.status, message);
  }
  const parsed: unknown = await res.json();
  if (!isAuthResponse(parsed)) throw new AuthError(res.status, 'malformed auth response');
  return parsed;
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
    // readline exposes no public way to suppress echo; stubbing _writeToOutput
    // is the standard trick, but the method is a private implementation detail
    // of readline, so the cast is unavoidable.
    // The prompt itself travels through the same hook as the echoed input, so
    // print it first and only then silence the output — otherwise the user
    // sees a blank line instead of "password: ".
    process.stdout.write(prompt);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      reject(new Error('aborted'));
    });
  });
}
