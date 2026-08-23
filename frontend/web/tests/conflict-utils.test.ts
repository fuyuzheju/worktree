import { describe, expect, it } from 'vitest';
import { formatHistoryOp } from '../src/conflict-utils';

describe('formatHistoryOp', () => {
  it('formats add and remove ops like the CLI conflict listing', () => {
    expect(
      formatHistoryOp({ kind: 'add', id: 'abcd-1234', op: { kind: 'rename', id: 'x', name: 'y' } }),
    ).toBe('abcd rename');
    expect(formatHistoryOp({ kind: 'remove', id: 'abcd-1234' })).toBe('abcd remove');
  });
});
