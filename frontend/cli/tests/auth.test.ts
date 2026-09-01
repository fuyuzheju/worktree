import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthError, defaultLabel, loginOnServer, promptPassword, registerOnServer, revokeOnServer } from '../src/auth';

const SERVER = 'http://localhost:3000';

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerOnServer', () => {
  it('posts to /api/register and returns the token', async () => {
    const calls = stubFetch(() =>
      new Response(JSON.stringify({ username: 'alice', token: 'tok-1', tokenId: 3 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const stored = await registerOnServer(SERVER, 'alice', 'hunter2222');
    expect(stored).toEqual({ token: 'tok-1', tokenId: 3 });
    expect(calls[0]!.url).toBe(`${SERVER}/api/register`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ username: 'alice', password: 'hunter2222' });
    expect(calls[0]!.init.headers).not.toHaveProperty('Authorization');
  });

  it('maps a 409 to AuthError with the server message', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'username taken' }), { status: 409 }));
    const err = await registerOnServer(SERVER, 'alice', 'hunter2222').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    if (!(err instanceof AuthError)) throw new Error('expected AuthError');
    expect(err.status).toBe(409);
    expect(err.message).toBe('username taken');
  });
});

describe('loginOnServer', () => {
  it('posts to /api/login with the device label and returns the token', async () => {
    const calls = stubFetch(() =>
      new Response(JSON.stringify({ username: 'alice', token: 'tok-2', tokenId: 4 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const stored = await loginOnServer(SERVER, 'alice', 'hunter2222', 'my-phone');
    expect(stored).toEqual({ token: 'tok-2', tokenId: 4, label: 'my-phone' });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      username: 'alice',
      password: 'hunter2222',
      label: 'my-phone',
    });
  });

  it('maps a 401 to AuthError', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'invalid username or password' }), { status: 401 }));
    const err = await loginOnServer(SERVER, 'alice', 'wrong').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    if (err instanceof AuthError) expect(err.status).toBe(401);
  });
});

describe('revokeOnServer', () => {
  it('POSTs /api/logout with the bearer token', async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await revokeOnServer(SERVER, 'tok-1');
    expect(calls[0]!.url).toBe(`${SERVER}/api/logout`);
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer tok-1' });
  });

  it('throws on a failed revoke (the caller decides whether to keep the local token)', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    await expect(revokeOnServer(SERVER, 'revoked')).rejects.toBeInstanceOf(AuthError);
  });
});

describe('promptPassword', () => {
  it('uses WORKTREE_PASSWORD when stdin is not a TTY', async () => {
    const prev = process.env.WORKTREE_PASSWORD;
    process.env.WORKTREE_PASSWORD = 'hunter2222';
    try {
      expect(await promptPassword('password: ')).toBe('hunter2222');
    } finally {
      if (prev === undefined) delete process.env.WORKTREE_PASSWORD;
      else process.env.WORKTREE_PASSWORD = prev;
    }
  });

  it('rejects without WORKTREE_PASSWORD when stdin is not a TTY', async () => {
    const prev = process.env.WORKTREE_PASSWORD;
    delete process.env.WORKTREE_PASSWORD;
    try {
      await expect(promptPassword('password: ')).rejects.toThrow(/WORKTREE_PASSWORD/);
    } finally {
      if (prev !== undefined) process.env.WORKTREE_PASSWORD = prev;
    }
  });
});

describe('defaultLabel', () => {
  it('includes the hostname', () => {
    expect(defaultLabel()).toMatch(/ \(cli\)$/);
  });
});
