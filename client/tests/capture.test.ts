import { describe, expect, it, vi } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import { WorktreeClient } from '../src/client';
import type { ClientStorage, SavedState } from '../src/storage';

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

const newClient = (opts?: { local?: boolean; storage?: ClientStorage }): WorktreeClient =>
  new WorktreeClient({
    serverUrl: 'http://localhost:1',
    user: opts?.local === true ? 'local' : 'alice',
    token: opts?.local === true ? undefined : 'test-token',
    local: opts?.local,
    storage: opts?.storage,
  });

const findNode = (node: Node, id: string): Node | undefined => {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
};

const nodeOf = (client: WorktreeClient, id: string): Node => {
  const node = findNode(client.getTree(), id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return node;
};

const names = (client: WorktreeClient, parentId: string): string[] =>
  nodeOf(client, parentId).children.map((c) => c.name);

describe('WorktreeClient.quickAdd', () => {
  it('creates /tmp and queues the capture as pending ops while offline', () => {
    const c = newClient();
    const result = c.quickAdd('买牛奶 明天');
    expect(result.displayPath).toBe('/tmp/买牛奶 明天');
    expect(c.getPendingCount()).toBe(2); // auto-created tmp + the node
    expect(names(c, ROOT_ID)).toEqual(['tmp']);
    const tmp = c.getTree().children[0];
    expect(tmp.children.map((n) => n.name)).toEqual(['买牛奶 明天']);
  });

  it('resolves a pending-created /tmp on the next capture and suffixes collisions', () => {
    const c = newClient();
    c.quickAdd('买牛奶');
    const second = c.quickAdd('买牛奶');
    expect(second.name).toBe('买牛奶 (2)');
    expect(second.displayPath).toBe('/tmp/买牛奶 (2)');
    expect(c.getPendingCount()).toBe(3); // tmp + two nodes, tmp created once
    expect(names(c, c.getTree().children[0].id)).toEqual(['买牛奶 (2)', '买牛奶']);
  });

  it('splits the note from the first line and places the node on top', () => {
    const c = newClient();
    const tmpId = c.addNode(ROOT_ID, 'tmp', 0);
    c.addNode(tmpId, 'older', 5);
    const result = c.quickAdd('name line\nnote line');
    expect(result.displayPath).toBe('/tmp/name line');
    const tmp = nodeOf(c, tmpId);
    expect(tmp.children.map((n) => n.name)).toEqual(['name line', 'older']);
    expect(tmp.children[0]?.note).toBe('note line');
    expect(tmp.children[0]?.weight).toBe(4); // min sibling weight - 1
  });

  it('appends straight into the confirmed history for the local user', () => {
    const c = newClient({ local: true });
    c.quickAdd('offline todo');
    expect(c.getPendingCount()).toBe(0);
    expect(c.getConfirmed()).toHaveLength(2);
    expect(c.getTree().children[0]?.name).toBe('tmp');
  });

  it('persists each capture once through the storage', () => {
    const storage = new MemoryStorage();
    const c = newClient({ storage });
    c.quickAdd('x');
    expect(storage.saveCount).toBe(1);
    expect(storage.state?.pending).toHaveLength(2);
  });

  it('notifies subscribers and re-renders', () => {
    const c = newClient();
    const seen = vi.fn();
    c.subscribe(seen);
    c.quickAdd('x');
    expect(seen).toHaveBeenCalled();
    expect(c.getTree().children[0]?.name).toBe('tmp');
  });

  it('rejects edits while the confirmed history fails to replay', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [{ id: 'h1', op: { kind: 'rename', id: 'missing', name: 'x' } }],
      pending: [],
    };
    const c = newClient({ storage });
    expect(() => c.quickAdd('x')).toThrow(/repair the history first/);
    expect(c.getPendingCount()).toBe(0);
  });

  it('syncNow resolves without rejecting when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('unreachable'))));
    try {
      const c = newClient();
      c.quickAdd('x');
      await expect(c.syncNow()).resolves.toBeUndefined();
      expect(c.getPendingCount()).toBe(2); // kept for a later flush
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
