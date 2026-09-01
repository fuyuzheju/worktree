import { describe, expect, it } from 'vitest';
import { parseTime } from '../src/time';

describe('parseTime', () => {
  it('parses a bare date as local midnight', () => {
    const t = parseTime('2026-09-01');
    expect(t).not.toBeNull();
    const d = new Date(t ?? NaN);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 9, 1]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it('parses ISO date-times without timezone as local time', () => {
    const t = parseTime('2026-09-01T10:30');
    expect(t).not.toBeNull();
    const d = new Date(t ?? NaN);
    expect([d.getHours(), d.getMinutes()]).toEqual([10, 30]);
  });

  it('parses ISO date-times with seconds, fractions and UTC', () => {
    expect(parseTime('2026-09-01T10:30:00Z')).toBe(Date.parse('2026-09-01T10:30:00Z'));
    expect(parseTime('2026-09-01T10:30:15.500Z')).toBe(Date.parse('2026-09-01T10:30:15.500Z'));
    expect(parseTime('2026-09-01T10:30:00+08:00')).toBe(Date.parse('2026-09-01T10:30:00+08:00'));
  });

  it('rejects non-ISO and invalid input', () => {
    expect(parseTime('1234567890')).toBeNull(); // epoch ms
    expect(parseTime('09/01/2026')).toBeNull(); // US format
    expect(parseTime('2026-09-01 10:00')).toBeNull(); // space separator
    expect(parseTime('2026-13-01')).toBeNull(); // invalid month
    expect(parseTime('2026-09-01T25:00')).toBeNull(); // invalid hour
    expect(parseTime('tomorrow')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});
