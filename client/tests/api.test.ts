import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { ServerAPI } from '../src/api';

function stubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServerAPI', () => {
  it('sends the X-User header on every request', async () => {
    const calls = stubFetch();
    const api = new ServerAPI('http://localhost:3000', 'alice');
    await api.submit([{ kind: 'add', id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }]);
    await api.history(null);
    await api.stats();
    await api.rewrite(null, []);
    expect(calls.map((c) => c.url)).toEqual([
      'http://localhost:3000/submit',
      'http://localhost:3000/history',
      'http://localhost:3000/stats',
      'http://localhost:3000/rewrite',
    ]);
    for (const call of calls) {
      expect(call.init?.headers).toMatchObject({ 'X-User': 'alice' });
    }
  });

  it('sends Content-Type only when there is a body', async () => {
    const calls = stubFetch();
    const api = new ServerAPI('http://localhost:3000', 'alice');
    await api.history(null);
    expect(calls[0]!.init?.headers).toEqual({ 'X-User': 'alice' });
    await api.submit([]);
    expect(calls[1]!.init?.headers).toMatchObject({ 'X-User': 'alice', 'Content-Type': 'application/json' });
  });
});
