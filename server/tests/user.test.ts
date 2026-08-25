import { describe, expect, it } from 'vitest';
import { parseBearerToken, parseUsername } from '../src/user';

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

describe('parseBearerToken', () => {
  it('extracts a bearer token', () => {
    expect(parseBearerToken(`Bearer ${'a'.repeat(43)}`)).toBe('a'.repeat(43));
  });

  it('rejects missing or malformed headers', () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken('')).toBeNull();
    expect(parseBearerToken('a'.repeat(43))).toBeNull(); // no scheme
    expect(parseBearerToken('bearer aaa')).toBeNull(); // scheme is case-sensitive
    expect(parseBearerToken('Bearer short')).toBeNull(); // too short
    expect(parseBearerToken(`Bearer ${'a'.repeat(101)}`)).toBeNull(); // too long
    expect(parseBearerToken('Bearer has spaces here!')).toBeNull(); // invalid chars
    expect(parseBearerToken('Basic abc')).toBeNull();
  });
});
