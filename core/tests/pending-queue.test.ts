import { describe, expect, it } from 'vitest';
import { PendingQueue } from '../src/index';
import type { HistoryOperation } from '../src/index';

const op = (id: string): HistoryOperation => ({
  kind: 'add',
  id,
  op: { kind: 'add', parentId: 'root', id, name: id, weight: 1 },
});

describe('PendingQueue', () => {
  it('is FIFO', () => {
    const q = new PendingQueue();
    q.enqueue(op('a'));
    q.enqueue(op('b'));
    expect(q.peek()?.id).toBe('a');
    expect(q.dequeue()?.id).toBe('a');
    expect(q.dequeue()?.id).toBe('b');
    expect(q.dequeue()).toBeUndefined();
  });

  it('confirm drops only the matching op', () => {
    const q = new PendingQueue();
    q.enqueue(op('a'));
    q.enqueue(op('b'));
    q.confirm('a');
    expect(q.getAll().map((o) => o.id)).toEqual(['b']);
  });

  it('confirm of an unknown id is a no-op', () => {
    const q = new PendingQueue();
    q.enqueue(op('a'));
    q.confirm('missing');
    expect(q.length).toBe(1);
  });

  it('clear empties the queue', () => {
    const q = new PendingQueue();
    q.enqueue(op('a'));
    q.clear();
    expect(q.length).toBe(0);
  });

  it('getAll returns a copy, not the internal array', () => {
    const q = new PendingQueue();
    q.enqueue(op('a'));
    const all = q.getAll();
    all.push(op('b'));
    expect(q.length).toBe(1);
  });

  it('peek on an empty queue returns undefined', () => {
    expect(new PendingQueue().peek()).toBeUndefined();
  });

  it('accepts remove ops too', () => {
    const q = new PendingQueue();
    q.enqueue({ kind: 'remove', id: 'a' });
    expect(q.peek()?.id).toBe('a');
  });
});
