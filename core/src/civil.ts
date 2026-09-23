import type { CivilDate, CivilTime, Timestamp } from './types';

/**
 * Pure integer civil-calendar arithmetic (proleptic Gregorian), no `Date`.
 * Rules carry a fixed `tzOffset`, so a civil day is a plain integer index
 * (days since 1970-01-01 in that offset) and every conversion is exact
 * integer math — no DST handling, no platform timezone dependence.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The civil date for a day index; inverse of `daysFromCivil`. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { year: y + (m <= 2 ? 1 : 0), month: m, day: d };
}

/** Weekday of a day index; 0 = Sunday .. 6 = Saturday (1970-01-01 was a Thursday). */
export function weekdayFromDays(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** True when the date exists in the civil calendar (rejects Feb 30 etc.). */
export function isValidCivilDate(date: CivilDate): boolean {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return false;
  if (date.month < 1 || date.month > 12) return false;
  return date.day >= 1 && date.day <= daysInMonth(date.year, date.month);
}

/** The Monday of the day index's week (weekday 1). */
export function mondayOf(days: number): number {
  return days - ((weekdayFromDays(days) + 6) % 7);
}

/** The civil day index a timestamp falls on, in the given offset. */
export function dayFromTimestamp(ms: Timestamp, tzOffset: number): number {
  return Math.floor((ms + tzOffset) / DAY_MS);
}

/** The timestamp of a civil date+time in the given offset. */
export function timestampFromCivil(date: CivilDate, time: CivilTime, tzOffset: number): Timestamp {
  return (
    daysFromCivil(date.year, date.month, date.day) * DAY_MS -
    tzOffset +
    time.hour * 60 * 60 * 1000 +
    time.minute * 60 * 1000
  );
}

/** The civil date+time a timestamp falls on, in the given offset. */
export function civilFromTimestamp(ms: Timestamp, tzOffset: number): { date: CivilDate; time: CivilTime } {
  const day = dayFromTimestamp(ms, tzOffset);
  const inDay = ms - startOfCivilDay(day, tzOffset);
  return {
    date: civilFromDays(day),
    time: { hour: Math.floor(inDay / (60 * 60 * 1000)), minute: Math.floor(inDay / 60000) % 60 },
  };
}

/** The first millisecond of a civil day in the given offset. */
export function startOfCivilDay(day: number, tzOffset: number): Timestamp {
  return day * DAY_MS - tzOffset;
}

/** The last millisecond of a civil day in the given offset. */
export function endOfCivilDay(day: number, tzOffset: number): Timestamp {
  return startOfCivilDay(day, tzOffset) + DAY_MS - 1;
}

/** `YYYY-MM-DD` for a day index (display). */
export function formatCivilDate(date: CivilDate): string {
  const m = date.month < 10 ? `0${date.month}` : `${date.month}`;
  const d = date.day < 10 ? `0${date.day}` : `${date.day}`;
  return `${date.year}-${m}-${d}`;
}

/** Parses `YYYY-MM-DD` into a civil date, or null when malformed/nonexistent. */
export function parseCivilDate(text: string): CivilDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m === null) return null;
  const date: CivilDate = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidCivilDate(date) ? date : null;
}
