import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import { ClientStore } from '../src/store';
import type { SavedState } from '../src/storage';

describe('ClientStore', () => {
  it('renders local ops optimistically and queues them', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    expect(store.getTree().children.map((c) => c.id)).toEqual(['a']);
    expect(store.getPending()).toHaveLength(1);
  });

  it('pending ops carry no parentId (the server orders by append)', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.applyLocal({ kind: 'rename', id: 'a', name: 'A2' });
    for (const p of store.getPending()) expect(p).not.toHaveProperty('parentId');
    expect(store.getTree().children[0]?.name).toBe('A2');
  });

  it('moves server-confirmed ops out of pending and stays idempotent', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    const p = store.getPending()[0]!;
    if (p.kind !== 'add') throw new Error('unexpected pending op kind');
    const node = { id: p.id, op: p.op };
    store.applyConfirmed(node);
    store.applyConfirmed(node); // duplicate delivery
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed()).toHaveLength(1);
    expect(store.getTree().children).toHaveLength(1);
  });

  it('confirmAllPending moves the whole chain to confirmed', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.applyLocal({ kind: 'rename', id: 'a', name: 'A2' });
    store.confirmAllPending();
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed()).toHaveLength(2);
    expect(store.getTree().children[0]?.name).toBe('A2');
  });

  it('applyRemoved undoes the confirmed head', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.confirmAllPending();
    const headId = store.getConfirmed().at(-1)!.id;
    store.applyRemoved(headId);
    expect(store.getConfirmed()).toHaveLength(0);
    expect(store.getTree().children).toHaveLength(0);
  });

  it('applyRemoved ignores ids that are not the local head', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.confirmAllPending();
    store.applyRemoved('unknown');
    expect(store.getConfirmed()).toHaveLength(1);
  });

  it('applyRemoved on an empty confirmed history is a no-op', () => {
    const store = new ClientStore();
    expect(() => store.applyRemoved('anything')).not.toThrow();
    expect(store.getConfirmed()).toHaveLength(0);
  });

  it('renders without pending ops that no longer apply to confirmed state', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    // The server rewrote history without 'a'; the pending rename can't apply.
    store.setConfirmed([]);
    store.applyLocal({ kind: 'rename', id: 'missing', name: 'X' });
    expect(() => store.getTree()).not.toThrow();
  });

  it('persists confirmed and pending state on every mutation', () => {
    const saved: SavedState[] = [];
    const store = new ClientStore((s) => saved.push(s));
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    expect(saved.at(-1)!.pending).toHaveLength(1);
    expect(saved.at(-1)!.confirmed).toHaveLength(0);
    const p = store.getPending()[0]!;
    if (p.kind !== 'add') throw new Error('unexpected pending op kind');
    store.applyConfirmed({ id: p.id, op: p.op });
    expect(saved.at(-1)!.pending).toHaveLength(0);
    expect(saved.at(-1)!.confirmed).toHaveLength(1);
    expect(saved.at(-1)!.confirmed[0]!.op).toEqual({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
  });

  it('restore refills confirmed and pending and rebuilds the tree once', () => {
    const saved: SavedState[] = [];
    const store = new ClientStore((s) => saved.push(s));
    store.restore(
      [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      [{ kind: 'add', id: 'h2', op: { kind: 'rename', id: 'a', name: 'A2' } }],
    );
    expect(store.getTree().children[0]?.name).toBe('A2');
    expect(store.getConfirmed()).toHaveLength(1);
    expect(store.getPending()).toHaveLength(1);
  });

  it('undoPendingAdd pops the newest pending add and rebuilds the tree', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 });
    expect(store.undoPendingAdd()).toBe(true);
    expect(store.getPending()).toHaveLength(1);
    expect(store.getTree().children.map((c) => c.id)).toEqual(['a']);
    expect(store.undoPendingAdd()).toBe(true);
    expect(store.getTree().children).toHaveLength(0);
    expect(store.undoPendingAdd()).toBe(false);
  });

  it('applyUndo queues a remove against the head and previews the tree without it', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.confirmAllPending();
    const headId = store.getConfirmed().at(-1)!.id;
    expect(store.applyUndo()).toBe(true);
    expect(store.getPending()).toEqual([{ kind: 'remove', id: headId }]);
    expect(store.getConfirmed()).toHaveLength(1);
    expect(store.getTree().children).toHaveLength(0);
  });

  it('applyUndo targets the previous head when a remove is already pending', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 });
    store.confirmAllPending();
    const [first, second] = store.getConfirmed().map((n) => n.id);
    expect(store.applyUndo()).toBe(true); // targets B
    expect(store.applyUndo()).toBe(true); // targets A
    expect(store.getPending()).toEqual([
      { kind: 'remove', id: second },
      { kind: 'remove', id: first },
    ]);
    expect(store.getTree().children).toHaveLength(0);
    expect(store.applyUndo()).toBe(false);
  });

  it('confirmAllPending applies a pending remove (head rolled back)', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 });
    store.confirmAllPending();
    store.applyUndo();
    store.confirmAllPending();
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed().map((n) => n.op.kind)).toEqual(['add']);
    expect(store.getTree().children.map((c) => c.id)).toEqual(['a']);
  });

  it('confirmAllPending applies removes and adds of the same batch in order', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.confirmAllPending();
    store.applyUndo();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 });
    const addId = store.getPending()[1]!.id;
    store.confirmAllPending();
    expect(store.getConfirmed().map((n) => n.id)).toEqual([addId]);
    expect(store.getTree().children.map((c) => c.id)).toEqual(['b']);
  });

  it('applyRemoved drops the matching pending remove (idempotent double-apply)', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.confirmAllPending();
    const headId = store.getConfirmed().at(-1)!.id;
    store.applyUndo();
    store.applyRemoved(headId);
    expect(store.getPending()).toHaveLength(0);
    expect(store.getConfirmed()).toHaveLength(0);
    expect(store.getTree().children).toHaveLength(0);
    store.applyRemoved(headId); // second delivery is a no-op
    expect(store.getConfirmed()).toHaveLength(0);
  });

  it('a stale pending remove (head advanced) does not hide confirmed ops', () => {
    const store = new ClientStore();
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 });
    store.applyLocal({ kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 });
    store.confirmAllPending();
    const first = store.getConfirmed()[0]!.id;
    store.restore(store.getConfirmed(), [{ kind: 'remove', id: first }]);
    expect(store.getTree().children.map((c) => c.id)).toEqual(['a', 'b']);
  });
});
