import { describe, expect, it } from 'vitest';
import { parseUsername } from '../src/user';

describe('parseUsername', () => {
  it('accepts letters, digits, dots, underscores and dashes', () => {
    expect(parseUsername('alice')).toBe('alice');
    expect(parseUsername('a1.b_c-d')).toBe('a1.b_c-d');
    expect(parseUsername('A')).toBe('A');
    expect(parseUsername('x'.repeat(64))).toBe('x'.repeat(64));
  });

  it('rejects invalid names', () => {
    expect(parseUsername(undefined)).toBeNull();
    expect(parseUsername(42)).toBeNull();
    expect(parseUsername('')).toBeNull();
    expect(parseUsername('a b')).toBeNull();
    expect(parseUsername('a/b')).toBeNull();
    expect(parseUsername('名字')).toBeNull();
    expect(parseUsername('x'.repeat(65))).toBeNull();
  });
});
