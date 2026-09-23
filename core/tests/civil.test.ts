import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  civilFromDays,
  civilFromTimestamp,
  dayFromTimestamp,
  daysFromCivil,
  daysInMonth,
  endOfCivilDay,
  formatCivilDate,
  isLeapYear,
  isValidCivilDate,
  mondayOf,
  parseCivilDate,
  startOfCivilDay,
  timestampFromCivil,
  weekdayFromDays,
} from '../src/index';

describe('civil calendar', () => {
  it('anchors day 0 at 1970-01-01 (a Thursday)', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(1969, 12, 31)).toBe(-1);
    expect(weekdayFromDays(0)).toBe(4);
    expect(weekdayFromDays(-1)).toBe(3);
  });

  it('round-trips dates, including pre-1970 and leap days', () => {
    for (const date of [
      { year: 1969, month: 12, day: 31 },
      { year: 1970, month: 1, day: 1 },
      { year: 2000, month: 2, day: 29 },
      { year: 2024, month: 2, day: 29 },
      { year: 2026, month: 9, day: 23 },
      { year: 2100, month: 12, day: 31 },
    ]) {
      expect(civilFromDays(daysFromCivil(date.year, date.month, date.day))).toEqual(date);
    }
  });

  it('matches Date.UTC across a sweep of days', () => {
    for (let days = -20000; days < 40000; days += 137) {
      const date = civilFromDays(days);
      expect(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS).toBe(days);
    }
  });

  it('knows leap years and month lengths', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it('rejects dates that do not exist and accepts real ones', () => {
    expect(isValidCivilDate({ year: 2026, month: 2, day: 30 })).toBe(false);
    expect(isValidCivilDate({ year: 2026, month: 13, day: 1 })).toBe(false);
    expect(isValidCivilDate({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isValidCivilDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    expect(parseCivilDate('2026-09-23')).toEqual({ year: 2026, month: 9, day: 23 });
    expect(parseCivilDate('2026-02-30')).toBeNull();
    expect(parseCivilDate('2026-9-23')).toBeNull();
  });

  it('finds the Monday of a week', () => {
    const wed = daysFromCivil(2026, 9, 23);
    expect(weekdayFromDays(wed)).toBe(3);
    expect(mondayOf(wed)).toBe(daysFromCivil(2026, 9, 21));
    expect(mondayOf(mondayOf(wed))).toBe(mondayOf(wed));
  });

  it('converts civil day boundaries with an offset', () => {
    const offset = 8 * 60 * 60 * 1000; // UTC+8
    const day = daysFromCivil(2026, 9, 23);
    const start = startOfCivilDay(day, offset);
    const end = endOfCivilDay(day, offset);
    expect(new Date(start).toISOString()).toBe('2026-09-22T16:00:00.000Z');
    expect(end - start).toBe(DAY_MS - 1);
    expect(dayFromTimestamp(start, offset)).toBe(day);
    expect(dayFromTimestamp(end, offset)).toBe(day);
    expect(dayFromTimestamp(end + 1, offset)).toBe(day + 1);
    expect(timestampFromCivil({ year: 2026, month: 9, day: 23 }, { hour: 10, minute: 30 }, offset)).toBe(
      start + 10.5 * 60 * 60 * 1000,
    );
    expect(civilFromTimestamp(start + 10.5 * 60 * 60 * 1000, offset)).toEqual({
      date: { year: 2026, month: 9, day: 23 },
      time: { hour: 10, minute: 30 },
    });
  });

  it('keeps a fixed offset across a real DST boundary', () => {
    // 2026-03-08 is the US DST switch: a fixed-offset rule must not shift.
    const est = -5 * 60 * 60 * 1000;
    const before = timestampFromCivil({ year: 2026, month: 3, day: 7 }, { hour: 10, minute: 0 }, est);
    const after = timestampFromCivil({ year: 2026, month: 3, day: 15 }, { hour: 10, minute: 0 }, est);
    expect(new Date(before).toISOString()).toBe('2026-03-07T15:00:00.000Z');
    expect(new Date(after).toISOString()).toBe('2026-03-15T15:00:00.000Z');
    expect(after - before).toBe(8 * DAY_MS);
  });

  it('formats dates with zero padding', () => {
    expect(formatCivilDate({ year: 2026, month: 9, day: 3 })).toBe('2026-09-03');
  });
});
