import type { AuthResponse } from '@worktree/core';

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Calls a public auth endpoint directly (not via ServerAPI, which is bound
 * to a token at construction). Throws AuthError with the server's message.
 */
export async function authRequest(
  baseUrl: string,
  path: '/api/register' | '/api/login' | '/api/logout',
  body: object,
  token?: string,
): Promise<AuthResponse & { ok?: boolean }> {
  const res = await fetch(baseUrl.replace(/\/+$/, '') + path, {
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
  return (await res.json()) as AuthResponse & { ok?: boolean };
}
