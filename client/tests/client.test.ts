import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { ApiError } from '../src/api';
import { WorktreeClient } from '../src/client';
import type { ClientStorage, SavedState } from '../src/storage';

const newClient = () => new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token' });

class MemoryStorage implements ClientStorage {
  state: SavedState | null = null;
  saveCount = 0;
  load(): SavedState | null {
    return this.state;
  }
  save(state: SavedState): void {
    this.saveCount++;
    this.state = state;
  }
}

describe('WorktreeClient semantic operations', () => {
  it('addNode generates ids and appends at the end by default weight', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const b = c.addNode(ROOT_ID, 'B');
    expect(a).not.toBe(b);
    expect(c.getTree().children.map((n) => n.id)).toEqual([a, b]);
    expect(c.getTree().children.map((n) => n.weight)).toEqual([1, 2]);
  });

  it('addNode honors an explicit weight', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const b = c.addNode(ROOT_ID, 'B', 0);
    expect(c.getTree().children.map((n) => n.id)).toEqual([b, a]);
  });

  it('removeNode, renameNode and setCompleted apply optimistically', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    c.renameNode(a, 'A2');
    c.setCompleted(a, true);
    expect(c.getTree().children[0]?.name).toBe('A2');
    expect(c.getTree().children[0]?.status).toBe(true);
    c.removeNode(a);
    expect(c.getTree().children).toHaveLength(0);
  });

  it('moveNode keeps the current weight when omitted', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A', 7);
    const b = c.addNode(ROOT_ID, 'B');
    expect(b).not.toBe(a);
    c.moveNode(b, a);
    const moved = c.getTree().children.find((n) => n.id === a)!.children[0]!;
    expect(moved.id).toBe(b);
    expect(moved.weight).toBe(8);
  });

  it('copyNode is shallow and generates a new id', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    c.addNode(a, 'child');
    c.addReminder(a, 'R', 1000);
    const copy = c.copyNode(a, ROOT_ID);
    expect(copy).not.toBe(a);
    const copyNode = c.getTree().children.find((n) => n.id === copy)!;
    expect(copyNode.name).toBe('A (copy)');
    expect(copyNode.children).toHaveLength(0);
    expect(copyNode.reminders).toHaveLength(1);
  });

  it('copyNode auto-renames on sibling collisions, incrementing the suffix', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const copy1 = c.copyNode(a, ROOT_ID);
    const copy2 = c.copyNode(a, ROOT_ID);
    const copyOfCopy = c.copyNode(copy1, ROOT_ID);
    expect(c.getTree().children.map((n) => n.name)).toEqual(['A', 'A (copy)', 'A (copy 2)', 'A (copy 3)']);
    expect(copyOfCopy).not.toBe(copy1);
  });

  it('copyNode keeps the source name when there is no collision', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const b = c.addNode(ROOT_ID, 'B');
    const copy = c.copyNode(a, b);
    expect(c.getTree().children.find((n) => n.id === b)!.children[0]!.name).toBe('A');
    expect(copy).not.toBe(a);
  });

  it('addNode rejects duplicate sibling names and invalid names', () => {
    const c = newClient();
    c.addNode(ROOT_ID, 'A');
    expect(() => c.addNode(ROOT_ID, 'A')).toThrow(/sibling named "A" already exists/);
    expect(() => c.addNode(ROOT_ID, '')).toThrow(/must not be empty/);
    expect(() => c.addNode(ROOT_ID, 'x/y')).toThrow(/must not contain/);
  });

  it('renameNode rejects colliding names but allows its own', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const b = c.addNode(ROOT_ID, 'B');
    expect(() => c.renameNode(b, 'A')).toThrow(/sibling named "A" already exists/);
    expect(() => c.renameNode(b, 'B')).not.toThrow();
    c.renameNode(a, 'A2');
    expect(c.getTree().children.find((n) => n.id === a)!.name).toBe('A2');
  });

  it('moveNode rejects moving into a parent with a same-named child', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const b = c.addNode(ROOT_ID, 'B');
    c.addNode(b, 'A');
    expect(() => c.moveNode(a, b)).toThrow(/sibling named "A" already exists/);
  });

  it('reminder helpers queue the right ops', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    const r = c.addReminder(a, 'R', 1000, 60);
    expect(c.getTree().children[0]?.reminders[0]).toMatchObject({ id: r, name: 'R', deadline: 1000, repeat: 60 });
    c.editReminder(r, { name: 'R2', repeat: null, active: false });
    const edited = c.getTree().children[0]?.reminders[0]!;
    expect(edited.name).toBe('R2');
    expect(edited.repeat).toBeUndefined();
    expect(edited.active).toBe(false);
    c.removeReminder(r);
    expect(c.getTree().children[0]?.reminders).toHaveLength(0);
  });

  it('addNode under an unknown parent throws', () => {
    const c = newClient();
    expect(() => c.addNode('missing', 'X')).toThrow();
  });

  it('addNode carries note, deadline and a fresh createdAt', () => {
    const c = newClient();
    const before = Date.now();
    const a = c.addNode(ROOT_ID, 'A', undefined, { note: 'hi', deadline: 1000 });
    const node = c.getTree().children.find((n) => n.id === a)!;
    expect(node.note).toBe('hi');
    expect(node.deadline).toBe(1000);
    expect(node.createdAt).toBeGreaterThanOrEqual(before);
    expect(node.createdAt).toBeLessThanOrEqual(Date.now());
  });

  it('setNote and setDeadline apply edit_node ops', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A', undefined, { deadline: 100 });
    c.setNote(a, 'first');
    c.setDeadline(a, 200);
    expect(c.getTree().children[0]).toMatchObject({ note: 'first', deadline: 200 });
    c.setNote(a, '');
    c.setDeadline(a, null);
    expect(c.getTree().children[0]).toMatchObject({ note: '', deadline: undefined });
  });

  it('copyNode carries note and deadline with a fresh createdAt', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A', undefined, { note: 'n', deadline: 50 });
    const before = Date.now();
    const copy = c.copyNode(a, ROOT_ID);
    const copyNode = c.getTree().children.find((n) => n.id === copy)!;
    expect(copyNode.note).toBe('n');
    expect(copyNode.deadline).toBe(50);
    expect(copyNode.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('setWeight reorders among siblings without changing the parent', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A', 1);
    const b = c.addNode(ROOT_ID, 'B', 2);
    const child = c.addNode(a, 'child');
    c.setWeight(b, 0);
    expect(c.getTree().children.map((n) => n.id)).toEqual([b, a]);
    expect(c.getTree().children.find((n) => n.id === a)!.children.map((n) => n.id)).toEqual([child]);
    c.setWeight(child, 5);
    expect(c.getTree().children.find((n) => n.id === a)!.children[0]!.weight).toBe(5);
  });

  it('restores persisted confirmed history and pending queue at construction', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      pending: [{ kind: 'add', id: 'h2', op: { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 } }],
    };
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token', storage });
    expect(c.getTree().children.map((n) => n.name)).toEqual(['A', 'B']);
    expect(c.getPendingCount()).toBe(1);
  });

  it('persists every mutation through the storage', () => {
    const storage = new MemoryStorage();
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token', storage });
    c.addNode(ROOT_ID, 'A');
    expect(storage.state?.pending).toHaveLength(1);
    expect(storage.state?.confirmed).toHaveLength(0);
    c.removeNode(c.getTree().children[0]!.id);
    expect(storage.state?.pending).toHaveLength(2);
    expect(storage.state?.pending[1]).toMatchObject({ kind: 'add' });
  });

  it('rejects invalid usernames at construction', () => {
    expect(() => new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'a/b' })).toThrow(/invalid username/);
    expect(() => new WorktreeClient({ serverUrl: 'http://localhost:1', user: '' })).toThrow(/invalid username/);
  });
});

describe('WorktreeClient local mode', () => {
  const localClient = (storage = new MemoryStorage()) =>
    new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'local', local: true, storage });

  it('isLocal and edits go straight into the confirmed history', () => {
    const c = localClient();
    expect(c.isLocal()).toBe(true);
    c.addNode(ROOT_ID, 'A');
    c.addNode(ROOT_ID, 'B');
    expect(c.getPendingCount()).toBe(0);
    expect(c.getTree().children.map((n) => n.name)).toEqual(['A', 'B']);
  });

  it('persists confirmed edits (no pending) and restores them', async () => {
    const storage = new MemoryStorage();
    const c = localClient(storage);
    c.addNode(ROOT_ID, 'A');
    expect(storage.state?.confirmed).toHaveLength(1);
    expect(storage.state?.pending).toHaveLength(0);

    const restored = localClient(storage);
    expect(restored.getTree().children.map((n) => n.name)).toEqual(['A']);
  });

  it('connect and reconnect are no-ops that never touch the network', async () => {
    const c = localClient();
    c.connect();
    expect(c.isOnline()).toBe(false);
    await expect(c.reconnect()).resolves.toBe(false);
    c.disconnect();
  });

  it('getStats computes from the local tree', async () => {
    const c = localClient();
    const a = c.addNode(ROOT_ID, 'A');
    c.addReminder(a, 'R', 1000);
    const stats = await c.getStats();
    expect(stats).toEqual({ opCount: 2, nodeCount: 1, reminderCount: 1, state: 'working' });
  });

  it('undo removes the confirmed head in local mode', () => {
    const c = localClient();
    const a = c.addNode(ROOT_ID, 'A');
    c.addNode(ROOT_ID, 'B');
    c.undo();
    expect(c.getTree().children.map((n) => n.id)).toEqual([a]);
    expect(c.getConfirmed()).toHaveLength(1);
    c.undo();
    expect(c.getTree().children).toHaveLength(0);
    expect(() => c.undo()).toThrow(/nothing to undo/);
  });
});

describe('WorktreeClient undo', () => {
  it('drops the last pending edit without any server op', () => {
    const c = newClient();
    const a = c.addNode(ROOT_ID, 'A');
    c.addNode(ROOT_ID, 'B');
    c.undo();
    expect(c.getTree().children.map((n) => n.id)).toEqual([a]);
    expect(c.getPendingCount()).toBe(1);
    c.undo();
    expect(c.getTree().children).toHaveLength(0);
    expect(c.getPendingCount()).toBe(0);
  });

  it('queues a remove history op against the confirmed head', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      pending: [],
    };
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token', storage });
    c.undo();
    expect(c.getPending()).toEqual([{ kind: 'remove', id: 'h1' }]);
    expect(c.getTree().children).toHaveLength(0);
    expect(storage.state?.pending).toEqual([{ kind: 'remove', id: 'h1' }]);
  });

  it('queues successive removes offline (undoing the previous heads)', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [
        { id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } },
        { id: 'h2', op: { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 } },
      ],
      pending: [],
    };
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token', storage });
    c.undo();
    expect(c.getPending()).toEqual([{ kind: 'remove', id: 'h2' }]);
    expect(c.getTree().children.map((n) => n.id)).toEqual(['a']);
    c.undo();
    expect(c.getPending()).toEqual([
      { kind: 'remove', id: 'h2' },
      { kind: 'remove', id: 'h1' },
    ]);
    expect(c.getTree().children).toHaveLength(0);
    expect(storage.state?.pending).toHaveLength(2);
    expect(() => c.undo()).toThrow(/nothing to undo/);
  });

  it('undo with a pending remove and an exhausted chain reports nothing to undo', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      pending: [{ kind: 'remove', id: 'h1' }],
    };
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token', storage });
    expect(() => c.undo()).toThrow(/nothing to undo/);
    expect(c.getPending()).toEqual([{ kind: 'remove', id: 'h1' }]);
  });

  it('throws when there is nothing to undo', () => {
    const c = newClient();
    expect(() => c.undo()).toThrow(/nothing to undo/);
  });

  it('undoes the pending add first, then the confirmed head', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      pending: [{ kind: 'add', id: 'h2', op: { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 } }],
    };
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token', storage });
    c.undo();
    expect(c.getPending()).toEqual([]);
    expect(c.getTree().children.map((n) => n.id)).toEqual(['a']);
    c.undo();
    expect(c.getPending()).toEqual([{ kind: 'remove', id: 'h1' }]);
    expect(c.getTree().children).toHaveLength(0);
  });
});

describe('WorktreeClient auth', () => {
  class FakeWebSocket {
    static instances: FakeWebSocket[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(public url: string) {
      FakeWebSocket.instances.push(this);
    }

    close(): void {}

    serverClose(): void {
      this.onclose?.();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requires a token for server users', () => {
    expect(() => new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice' })).toThrow(/token required/);
  });

  it('needs no token in local mode', () => {
    expect(() => new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'local', local: true })).not.toThrow();
  });

  it('a 401 during the automatic resync marks the client as auth-failed and stops reconnecting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })),
    );
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'revoked' });
    const attempt = c.reconnect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(c.isAuthFailed()).toBe(false);

    // The socket opens; the automatic resync gets a 401 from the REST API.
    FakeWebSocket.instances[0]!.onopen?.();
    await expect(attempt).resolves.toBe(false);
    expect(c.isAuthFailed()).toBe(true);

    // the closed socket must not reconnect
    FakeWebSocket.instances[0]!.serverClose();
    vi.advanceTimersByTime(120_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('a failed handshake plus network errors do not mark the client as auth-failed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'tok' });
    const attempt = c.reconnect();
    FakeWebSocket.instances[0]!.onclose?.();
    await expect(attempt).resolves.toBe(false);
    expect(c.isAuthFailed()).toBe(false);
  });
});
