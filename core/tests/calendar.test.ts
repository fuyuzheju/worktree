import { describe, expect, it } from 'vitest';
import { Calendar } from '../src/index';

const addBlock = (id: string, start = 0, end = 10, name = id) =>
  ({ kind: 'add_block', id, name, start, end }) as const;

describe('Calendar', () => {
  it('builds from add_block ops in order', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1', 0, 10, 'morning'));
    calendar.apply(addBlock('b2', 10, 20, 'afternoon'));
    expect(calendar.getBlocks().map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(calendar.blockCount()).toBe(2);
    expect(calendar.getBlocks()[0]).toMatchObject({
      name: 'morning',
      start: 0,
      end: 10,
      note: '',
      status: false,
      nodeId: undefined,
    });
  });

  it('accepts an optional note and nodeId', () => {
    const calendar = new Calendar();
    calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10, note: 'n', nodeId: 'a' });
    expect(calendar.getBlocks()[0]).toMatchObject({ note: 'n', nodeId: 'a' });
  });

  it('rejects a duplicate block id', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    expect(() => calendar.apply(addBlock('b1'))).toThrow(/duplicate block id/);
  });

  it('rejects an empty name', () => {
    const calendar = new Calendar();
    expect(() => calendar.apply({ kind: 'add_block', id: 'b1', name: '', start: 0, end: 10 })).toThrow(/must not be empty/);
  });

  it('rejects start >= end', () => {
    const calendar = new Calendar();
    expect(() => calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 10, end: 10 })).toThrow(/start must be before end/);
    expect(() => calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 11, end: 10 })).toThrow(/start must be before end/);
  });

  it('rejects linking a node already linked by another block', () => {
    const calendar = new Calendar();
    calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10, nodeId: 'a' });
    expect(() => calendar.apply({ kind: 'add_block', id: 'b2', name: 'C', start: 0, end: 10, nodeId: 'a' })).toThrow(
      /node already linked to a block: a/,
    );
  });

  it('allows several standalone blocks and blocks on different nodes', () => {
    const calendar = new Calendar();
    calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10, nodeId: 'a' });
    calendar.apply({ kind: 'add_block', id: 'b2', name: 'C', start: 0, end: 10, nodeId: 'b' });
    calendar.apply(addBlock('b3'));
    expect(calendar.blockCount()).toBe(3);
  });

  it('remove_block is idempotent', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    calendar.apply({ kind: 'remove_block', id: 'b1' });
    calendar.apply({ kind: 'remove_block', id: 'b1' }); // no-op, no throw
    calendar.apply({ kind: 'remove_block', id: 'missing' }); // no-op, no throw
    expect(calendar.blockCount()).toBe(0);
  });

  it('edit_block applies a partial patch', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    calendar.apply({ kind: 'edit_block', id: 'b1', name: 'renamed', note: 'n' });
    const b = calendar.getBlocks()[0]!;
    expect(b.name).toBe('renamed');
    expect(b.note).toBe('n');
    expect(b.start).toBe(0);
    expect(b.end).toBe(10);
  });

  it('edit_block nodeId: null clears the link', () => {
    const calendar = new Calendar();
    calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10, nodeId: 'a' });
    calendar.apply({ kind: 'edit_block', id: 'b1', nodeId: null });
    expect(calendar.getBlocks()[0]!.nodeId).toBeUndefined();
  });

  it('edit_block rejects an unknown id', () => {
    const calendar = new Calendar();
    expect(() => calendar.apply({ kind: 'edit_block', id: 'missing', name: 'x' })).toThrow(/unknown block id/);
  });

  it('edit_block rejects an empty patch', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    expect(() => calendar.apply({ kind: 'edit_block', id: 'b1' })).toThrow(/patch is empty/);
  });

  it('edit_block rejects an empty name', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    expect(() => calendar.apply({ kind: 'edit_block', id: 'b1', name: '' })).toThrow(/must not be empty/);
  });

  it('edit_block validates the merged start/end', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1', 0, 10));
    expect(() => calendar.apply({ kind: 'edit_block', id: 'b1', start: 15 })).toThrow(/start must be before end/);
    expect(() => calendar.apply({ kind: 'edit_block', id: 'b1', end: 0 })).toThrow(/start must be before end/);
    calendar.apply({ kind: 'edit_block', id: 'b1', end: 20 });
    expect(calendar.getBlocks()[0]!.end).toBe(20);
  });

  it('edit_block rejects relinking to a node another block links, allows a free one', () => {
    const calendar = new Calendar();
    calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10, nodeId: 'a' });
    calendar.apply(addBlock('b2'));
    expect(() => calendar.apply({ kind: 'edit_block', id: 'b2', nodeId: 'a' })).toThrow(/node already linked to a block/);
    calendar.apply({ kind: 'edit_block', id: 'b2', nodeId: 'b' });
    expect(calendar.getBlocks()[1]!.nodeId).toBe('b');
  });

  it('complete_block/uncomplete_block toggle status and reject unknown ids', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    expect(() => calendar.apply({ kind: 'complete_block', id: 'missing' })).toThrow(/unknown block id/);
    expect(() => calendar.apply({ kind: 'uncomplete_block', id: 'missing' })).toThrow(/unknown block id/);
    calendar.apply({ kind: 'complete_block', id: 'b1' });
    expect(calendar.getBlocks()[0]!.status).toBe(true);
    calendar.apply({ kind: 'uncomplete_block', id: 'b1' });
    expect(calendar.getBlocks()[0]!.status).toBe(false);
  });

  it('clone() is a deep copy isolated from mutations', () => {
    const calendar = new Calendar();
    calendar.apply(addBlock('b1'));
    const copy = calendar.clone();
    copy.apply({ kind: 'edit_block', id: 'b1', name: 'changed' });
    copy.apply({ kind: 'remove_block', id: 'b1' });
    expect(calendar.blockCount()).toBe(1);
    expect(calendar.getBlocks()[0]!.name).toBe('b1');
  });
});
