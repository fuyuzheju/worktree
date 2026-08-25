import { describe, expect, it } from 'vitest';
import { epochToLocalInput, formatDeadline, localInputToEpoch } from '../src/time';

describe('time helpers', () => {
  it('formats epoch ms for a datetime-local input with seconds', () => {
    const ms = new Date(2026, 7, 25, 9, 5, 7).getTime(); // local time, Aug 25 2026 09:05:07
    expect(epochToLocalInput(ms)).toBe('2026-08-25T09:05:07');
  });

  it('pads single-digit fields', () => {
    const ms = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(epochToLocalInput(ms)).toBe('2026-01-02T03:04:05');
  });

  it('parses a datetime-local value with seconds to epoch ms', () => {
    const expected = new Date(2026, 7, 25, 9, 5, 7).getTime();
    expect(localInputToEpoch('2026-08-25T09:05:07')).toBe(expected);
  });

  it('roundtrips through the local-timezone pair', () => {
    const ms = new Date(2026, 7, 25, 23, 59, 59).getTime();
    expect(localInputToEpoch(epochToLocalInput(ms))).toBe(ms);
  });

  it('parses minute-only values (legacy format) and empty input', () => {
    expect(localInputToEpoch('2026-08-25T09:05')).toBe(new Date(2026, 7, 25, 9, 5).getTime());
    expect(localInputToEpoch('')).toBeNull();
    expect(localInputToEpoch('not a date')).toBeNull();
  });

  it('keeps formatDeadline as ISO', () => {
    expect(formatDeadline(new Date('2026-08-25T00:00:00Z').getTime())).toBe('2026-08-25T00:00:00.000Z');
  });
});
