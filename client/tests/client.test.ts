import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { WorktreeClient } from '../src/client';
import type { ClientStorage, SavedState } from '../src/storage';

const newClient = () => new WorktreeClient({ serverUrl: 'http://localhost:1' });

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

  it('restores persisted confirmed history and pending queue at construction', () => {
    const storage = new MemoryStorage();
    storage.state = {
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      pending: [{ kind: 'add', id: 'h2', op: { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 } }],
    };
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', storage });
    expect(c.getTree().children.map((n) => n.name)).toEqual(['A', 'B']);
    expect(c.getPendingCount()).toBe(1);
  });

  it('persists every mutation through the storage', () => {
    const storage = new MemoryStorage();
    const c = new WorktreeClient({ serverUrl: 'http://localhost:1', storage });
    c.addNode(ROOT_ID, 'A');
    expect(storage.state?.pending).toHaveLength(1);
    expect(storage.state?.confirmed).toHaveLength(0);
    c.removeNode(c.getTree().children[0]!.id);
    expect(storage.state?.pending).toHaveLength(2);
    expect(storage.state?.pending[1]).toMatchObject({ kind: 'add' });
  });
});
