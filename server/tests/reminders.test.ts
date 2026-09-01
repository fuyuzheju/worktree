import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID, Tree } from '@worktree/core';
import type { TreeOperation } from '@worktree/core';
import { prismaMock, resetDb, seedUser } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import { FIRE_WINDOW_MS, computeDue, payloadFor, startReminderSweeper, sweepOnce } from '../src/reminders';
import type { PushPayload } from '../src/reminders';
import { HistoryStore } from '../src/store';

const W = FIRE_WINDOW_MS;

const addNode = (id: string, parentId = ROOT_ID): TreeOperation => ({
  kind: 'add',
  parentId,
  id,
  name: id,
  weight: 1,
});

const addRmd = (nodeId: string, rmdId: string, deadline: number, repeat?: number): TreeOperation => ({
  kind: 'add_reminder',
  nodeId,
  rmdId,
  name: rmdId,
  deadline,
  ...(repeat !== undefined ? { repeat } : {}),
});

const complete = (id: string): TreeOperation => ({ kind: 'complete', id });

function treeWith(...ops: TreeOperation[]): Tree {
  return Tree.fromOps(ops);
}

describe('computeDue', () => {
  const now = 10_000;

  it('includes a one-shot reminder whose deadline just passed', () => {
    const due = computeDue(treeWith(addNode('a'), addRmd('a', 'r1', now - 1)), 1, now);
    expect(due).toEqual([{ userId: 1, nodeId: 'a', nodeName: 'a', rmdId: 'r1', name: 'r1', occurrence: now - 1 }]);
  });

  it('fires a nameless reminder with no name', () => {
    const tree = treeWith(addNode('a'), { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', deadline: now - 1 });
    const due = computeDue(tree, 1, now);
    expect(due).toEqual([{ userId: 1, nodeId: 'a', nodeName: 'a', rmdId: 'r1', name: undefined, occurrence: now - 1 }]);
    expect(payloadFor(due[0]).title).toBeUndefined();
  });

  it('excludes a reminder that is still in the future', () => {
    expect(computeDue(treeWith(addNode('a'), addRmd('a', 'r1', now + 1)), 1, now)).toEqual([]);
  });

  it('excludes a one-shot that passed longer than the window ago (never backfilled)', () => {
    expect(computeDue(treeWith(addNode('a'), addRmd('a', 'r1', now - W)), 1, now)).toEqual([]);
    // boundary: exactly at the window edge is excluded
    expect(computeDue(treeWith(addNode('a'), addRmd('a', 'r1', now - W)), 1, now)).toEqual([]);
  });

  it('includes the latest occurrence of a repeating reminder', () => {
    // deadline 1000, repeat 500: occurrences at 1500, 2000, 2500
    const due = computeDue(treeWith(addNode('a'), addRmd('a', 'r1', 1000, 500)), 1, 2760);
    expect(due).toHaveLength(1);
    expect(due[0].occurrence).toBe(2500);
  });

  it('emits only the latest occurrence — missed ones are never backfilled', () => {
    // now far past deadline: dozens of occurrences passed, but only the
    // newest one is a candidate (it must also fall inside the window)
    const due = computeDue(treeWith(addNode('a'), addRmd('a', 'r1', 1000, 500)), 1, 2000 + W + 100);
    expect(due).toHaveLength(1);
    expect(due[0].occurrence).toBe(1000 + 122 * 500);
  });

  it('treats repeat <= 0 as a one-shot', () => {
    const due = computeDue(treeWith(addNode('a'), addRmd('a', 'r1', now - 1, 0)), 1, now);
    expect(due).toHaveLength(1);
    expect(due[0].occurrence).toBe(now - 1);
  });

  it('never fires an inactive reminder', () => {
    const tree = Tree.fromOps([addNode('a'), addRmd('a', 'r1', now - 1), { kind: 'edit_reminder', rmdId: 'r1', active: false }]);
    expect(computeDue(tree, 1, now)).toEqual([]);
  });

  it('never fires a reminder on a completed node', () => {
    const tree = treeWith(addNode('a'), addRmd('a', 'r1', now - 1), complete('a'));
    expect(computeDue(tree, 1, now)).toEqual([]);
  });

  it('walks nested nodes', () => {
    const tree = treeWith(addNode('a'), addNode('b', 'a'), addRmd('b', 'r1', now - 1));
    const due = computeDue(tree, 1, now);
    expect(due).toHaveLength(1);
    expect(due[0].nodeId).toBe('b');
  });

  it('still fires reminders of a completed subtree sibling', () => {
    const tree = treeWith(addNode('a'), addRmd('a', 'r1', now - 1), complete('a'), addNode('b'), addRmd('b', 'r2', now - 1));
    const due = computeDue(tree, 1, now);
    expect(due.map((d) => d.rmdId)).toEqual(['r2']);
  });
});

describe('sweepOnce', () => {
  const now = 10_000;

  beforeEach(async () => {
    resetDb();
    await seedUser('alice');
    await seedUser('bob');
  });

  /** One store per test: trees live in the store, so seeding and sweeping must share it. */
  async function makeStoreWith(user: string, ...ops: TreeOperation[]): Promise<HistoryStore> {
    const store = new HistoryStore();
    const history = ops.map((op, i) => ({ kind: 'add' as const, id: `h${i}`, op }));
    await store.appendBatch(user, history);
    return store;
  }

  async function subscribe(user: string, endpoint: string): Promise<void> {
    const userId = (await prismaMock.user.findUnique({ where: { name: user } }))!.id;
    await prismaMock.pushSubscription.create({ data: { endpoint, p256dh: 'p', auth: 'a', userId } });
  }

  it('sends once per due occurrence and never twice', async () => {
    const store = await makeStoreWith('alice', addNode('a'), addRmd('a', 'r1', now - 1));
    await subscribe('alice', 'https://push.example/1');
    const sends: PushPayload[] = [];
    const send = vi.fn(async (_sub, payload: PushPayload) => void sends.push(payload));

    await sweepOnce(store, now, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sends[0]).toEqual({ title: 'r1', body: 'a', tag: 'worktree-reminder', icon: '/icons/icon-192.png', url: '/?node=a' });

    // same occurrence, same window: deduped
    await sweepOnce(store, now, send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send to a user with no subscriptions', async () => {
    const store = await makeStoreWith('alice', addNode('a'), addRmd('a', 'r1', now - 1));
    const send = vi.fn(async () => undefined);
    await sweepOnce(store, now, send);
    expect(send).not.toHaveBeenCalled();
  });

  it('deletes dead subscriptions (404/410) without retrying the occurrence', async () => {
    const store = await makeStoreWith('alice', addNode('a'), addRmd('a', 'r1', now - 1));
    await subscribe('alice', 'https://push.example/gone');
    const send = vi.fn(async () => {
      throw { statusCode: 404 };
    });
    await sweepOnce(store, now, send);
    await sweepOnce(store, now, send);
    expect(send).toHaveBeenCalledTimes(1);
    const subs = await prismaMock.pushSubscription.findMany({ where: { userId: 1 } });
    expect(subs).toEqual([]);
  });

  it('retries on a transient send failure', async () => {
    const store = await makeStoreWith('alice', addNode('a'), addRmd('a', 'r1', now - 1));
    await subscribe('alice', 'https://push.example/flaky');
    const send = vi.fn(async () => {
      throw new Error('network down');
    });
    await sweepOnce(store, now, send);
    await sweepOnce(store, now, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('delivers to every subscription of the user', async () => {
    const store = await makeStoreWith('alice', addNode('a'), addRmd('a', 'r1', now - 1));
    await subscribe('alice', 'https://push.example/1');
    await subscribe('alice', 'https://push.example/2');
    const send = vi.fn(async () => undefined);
    await sweepOnce(store, now, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('delivers per user, only for that user\'s reminders', async () => {
    const store = await makeStoreWith('alice', addNode('a'), addRmd('a', 'r1', now - 1));
    await store.appendBatch('bob', [
      { kind: 'add', id: 'hb', op: addNode('b') },
      { kind: 'add', id: 'hb2', op: addRmd('b', 'r2', now - 1) },
    ]);
    await subscribe('bob', 'https://push.example/bob');
    const send = vi.fn(async (_sub: unknown, payload: PushPayload) => undefined);
    await sweepOnce(store, now, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].body).toBe('b');
  });

  it('builds a deep-link payload with the node id', () => {
    const due = computeDue(treeWith(addNode('x'), addRmd('x', 'r', now - 1)), 1, now)[0];
    expect(payloadFor(due).url).toBe('/?node=x');
  });

  it('refuses to start when the sweep interval is not smaller than the fire window', () => {
    const store = new HistoryStore();
    expect(() => startReminderSweeper({ store, intervalMs: FIRE_WINDOW_MS })).toThrow(/fire window/);
    expect(() => startReminderSweeper({ store, intervalMs: FIRE_WINDOW_MS + 60_000 })).toThrow(/fire window/);
  });
});
