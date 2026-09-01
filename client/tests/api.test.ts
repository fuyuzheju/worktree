import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { ServerAPI } from '../src/api';

function stubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith('/api/history')
        ? { cursorFound: true, nodes: [] }
        : url.endsWith('/api/stats')
          ? { opCount: 0, nodeCount: 0, reminderCount: 0, blockCount: 0, state: 'working' }
          : { ok: true };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServerAPI', () => {
  it('sends the Authorization bearer header on every request', async () => {
    const calls = stubFetch();
    const api = new ServerAPI('http://localhost:3000', 'token-abc');
    await api.submit([{ kind: 'add', id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }]);
    await api.history(null);
    await api.stats();
    await api.rewrite(null, []);
    expect(calls.map((c) => c.url)).toEqual([
      'http://localhost:3000/api/submit',
      'http://localhost:3000/api/history',
      'http://localhost:3000/api/stats',
      'http://localhost:3000/api/rewrite',
    ]);
    for (const call of calls) {
      expect(call.init?.headers).toMatchObject({ Authorization: 'Bearer token-abc' });
    }
  });

  it('sends Content-Type only when there is a body', async () => {
    const calls = stubFetch();
    const api = new ServerAPI('http://localhost:3000', 'token-abc');
    await api.history(null);
    expect(calls[0].init?.headers).toEqual({ Authorization: 'Bearer token-abc' });
    await api.submit([]);
    expect(calls[1].init?.headers).toMatchObject({ Authorization: 'Bearer token-abc', 'Content-Type': 'application/json' });
  });
});
