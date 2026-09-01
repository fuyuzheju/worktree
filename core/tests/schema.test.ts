import { describe, expect, it } from 'vitest';
import { operationSchema } from '../src/schema';

describe('operationSchema', () => {
  it('accepts every op kind', () => {
    const ops = [
      { kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: 1 },
      { kind: 'remove', id: 'a' },
      { kind: 'rename', id: 'a', name: 'B' },
      { kind: 'move', id: 'a', parentId: 'b', weight: 2 },
      { kind: 'copy', id: 'a', parentId: 'root', newId: 'c', weight: 1 },
      { kind: 'complete', id: 'a' },
      { kind: 'uncomplete', id: 'a' },
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r', name: 'R', deadline: 100 },
      { kind: 'remove_reminder', rmdId: 'r' },
      { kind: 'edit_reminder', rmdId: 'r', repeat: null },
      { kind: 'edit_node', id: 'a', deadline: null },
      { kind: 'add_block', id: 'b1', name: 'Block', start: 0, end: 10 },
      { kind: 'remove_block', id: 'b1' },
      { kind: 'edit_block', id: 'b1', nodeId: null },
      { kind: 'complete_block', id: 'b1' },
      { kind: 'uncomplete_block', id: 'b1' },
    ];
    for (const op of ops) {
      expect(operationSchema.parse(op)).toEqual(op);
    }
  });

  it('accepts legacy ops with the new optional fields missing', () => {
    expect(operationSchema.parse({ kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: 1 })).toMatchObject({
      kind: 'add',
    });
  });

  it('rejects an unknown kind', () => {
    expect(operationSchema.safeParse({ kind: 'explode', id: 'a' }).success).toBe(false);
  });

  it('rejects wrong field types', () => {
    expect(operationSchema.safeParse({ kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: '1' }).success).toBe(
      false,
    );
    expect(operationSchema.safeParse({ kind: 'remove', id: '' }).success).toBe(false);
  });
});
