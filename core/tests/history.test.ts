import { describe, expect, it } from 'vitest';
import { HistoryChain } from '../src/index';
import type { TreeOperation } from '../src/index';

const op = (id: string): TreeOperation => ({ kind: 'add', parentId: 'root', id, name: id, weight: 1 });

describe('HistoryChain', () => {
  it('appends in order and reports the head', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.append('n2', op('b'));
    expect(h.getHead()?.id).toBe('n2');
    expect(h.toArray().map((n) => n.id)).toEqual(['n1', 'n2']);
  });

  it('rejects duplicate ids', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    expect(() => h.append('n1', op('b'))).toThrow();
  });

  it('since(cursor) returns only nodes after the cursor; unknown cursor returns the whole chain', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.append('n2', op('b'));
    h.append('n3', op('c'));
    expect(h.since('n1').map((n) => n.id)).toEqual(['n2', 'n3']);
    expect(h.since('n3').map((n) => n.id)).toEqual([]);
    expect(h.since(null).map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(h.since('missing').map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('remove undoes the head', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.append('n2', op('b'));
    h.remove('n2');
    expect(h.getHead()?.id).toBe('n1');
    expect(h.length).toBe(1);
  });

  it('rejects removing a non-head entry', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.append('n2', op('b'));
    expect(() => h.remove('n1')).toThrow();
    expect(() => h.remove('missing')).toThrow();
  });

  it('replace swaps the whole history', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.replace([{ id: 'm1', op: op('x') }, { id: 'm2', op: op('y') }]);
    expect(h.getHead()?.id).toBe('m2');
    expect(h.length).toBe(2);
    expect(h.since('m1').map((n) => n.id)).toEqual(['m2']);
  });

  it('replace with an empty array empties the chain', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.replace([]);
    expect(h.getHead()).toBeUndefined();
    expect(h.length).toBe(0);
    expect(h.since(null)).toEqual([]);
  });

  it('get returns nodes by id', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    expect(h.get('n1')?.op).toEqual(op('a'));
    expect(h.get('missing')).toBeUndefined();
  });

  it('head is undefined on an empty chain', () => {
    expect(new HistoryChain().getHead()).toBeUndefined();
  });

  it('remove of the last node empties the chain', () => {
    const h = new HistoryChain();
    h.append('n1', op('a'));
    h.remove('n1');
    expect(h.getHead()).toBeUndefined();
    expect(h.length).toBe(0);
  });

  it('since on an empty chain returns an empty array', () => {
    const h = new HistoryChain();
    expect(h.since(null)).toEqual([]);
    expect(h.since('missing')).toEqual([]);
  });
});
