import type { BlockOccurrence, BlockRule, Timestamp } from './types';
import {
  DAY_MS,
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  isValidCivilDate,
  mondayOf,
  weekdayFromDays,
} from './civil';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * The pure calendar-arithmetic engine for BlockRules: validation, the day
 * predicate and windowed occurrence expansion. No state, no `Date` — a rule's
 * fixed tzOffset makes every conversion plain integer math.
 */

/** Validates the rule's structure and its frequency-scoped selector combination. */
export function validateRule(rule: BlockRule): void {
  if (rule.name === '') throw new Error('rule name must not be empty');
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new Error(`rule interval must be a positive integer: ${rule.interval}`);
  }
  if (!isValidCivilDate(rule.startDate)) {
    throw new Error(
      `invalid rule start date: ${rule.startDate.year}-${rule.startDate.month}-${rule.startDate.day}`,
    );
  }
  if (anchorDay(rule) < 0) {
    throw new Error(`rule start date must not be before 1970-01-01: ${rule.startDate.year}-${rule.startDate.month}-${rule.startDate.day}`);
  }
  if (!Number.isInteger(rule.timeOfDay.hour) || rule.timeOfDay.hour < 0 || rule.timeOfDay.hour > 23) {
    throw new Error(`rule hour out of range: ${rule.timeOfDay.hour}`);
  }
  if (!Number.isInteger(rule.timeOfDay.minute) || rule.timeOfDay.minute < 0 || rule.timeOfDay.minute > 59) {
    throw new Error(`rule minute out of range: ${rule.timeOfDay.minute}`);
  }
  if (!Number.isInteger(rule.duration) || rule.duration <= 0) {
    throw new Error(`rule duration must be a positive number of ms: ${rule.duration}`);
  }
  if (!Number.isInteger(rule.tzOffset) || rule.tzOffset % MINUTE_MS !== 0) {
    throw new Error(`rule tz offset must be whole minutes: ${rule.tzOffset}`);
  }
  if (rule.until !== undefined && (!Number.isInteger(rule.until) || rule.until < 0)) {
    throw new Error(`rule until must be a non-negative number of ms: ${rule.until}`);
  }

  switch (rule.freq) {
    case 'daily':
      if (hasAnySelector(rule)) throw new Error('daily rules take no selectors');
      return;
    case 'weekly':
      if (rule.byMonthDay !== undefined || rule.byMonth !== undefined || rule.bySetPos !== undefined) {
        throw new Error('weekly rules take only byDay');
      }
      if (rule.byDay !== undefined) validateSelector('byDay', rule.byDay, 0, 6);
      return;
    case 'monthly':
      if (rule.byMonth !== undefined) throw new Error('monthly rules take byMonthDay or byDay, not byMonth');
      if (rule.byMonthDay !== undefined && rule.byDay !== undefined) {
        throw new Error('monthly rules take byMonthDay or byDay, not both');
      }
      if (rule.bySetPos !== undefined && rule.byDay === undefined) {
        throw new Error('bySetPos requires byDay');
      }
      if (rule.byDay !== undefined) validateSelector('byDay', rule.byDay, 0, 6);
      if (rule.byMonthDay !== undefined) validateSelector('byMonthDay', rule.byMonthDay, 1, 31, true);
      if (rule.bySetPos !== undefined) validateSetPos(rule.bySetPos);
      return;
    case 'yearly':
      if (rule.byDay !== undefined || rule.bySetPos !== undefined) {
        throw new Error('yearly rules take byMonth and byMonthDay');
      }
      if (rule.byMonth !== undefined) validateSelector('byMonth', rule.byMonth, 1, 12);
      if (rule.byMonthDay !== undefined) validateSelector('byMonthDay', rule.byMonthDay, 1, 31, true);
      return;
  }
}

/** The civil day the rule's startDate falls on. */
export function anchorDay(rule: BlockRule): number {
  return daysFromCivil(rule.startDate.year, rule.startDate.month, rule.startDate.day);
}

/** The start timestamp of the rule's occurrence on the given civil day. */
export function occurrenceStart(rule: BlockRule, day: number): Timestamp {
  return day * DAY_MS - rule.tzOffset + rule.timeOfDay.hour * HOUR_MS + rule.timeOfDay.minute * MINUTE_MS;
}

/**
 * Whether the rule's schedule produces an occurrence on the civil day,
 * ignoring `active` (used by expansion and by skip validation alike). The day
 * is an occurrence key, so `until` bounds it too: a day past `until` is not
 * an occurrence and cannot be skipped.
 */
export function ruleMatchesDay(rule: BlockRule, day: number): boolean {
  if (day < anchorDay(rule)) return false;
  if (rule.until !== undefined && occurrenceStart(rule, day) > rule.until) return false;
  return frequencyMatches(rule, day);
}

/**
 * Expands the rule's occurrences overlapping `[from, to)` — `occStart < to &&
 * occEnd > from` — sorted by `occStart`. Skipped days are excluded; so is
 * every day the schedule does not match, including `byMonthDay: 31` in a
 * short month (skipped, never clamped).
 */
export function expandRule(
  rule: BlockRule,
  skippedDays: ReadonlySet<number> | undefined,
  from: Timestamp,
  to: Timestamp,
): BlockOccurrence[] {
  if (!rule.active || to <= from) return [];
  // The first occurrence that can overlap the window starts at from - duration + 1;
  // occStart >= day * DAY_MS - tzOffset, so this day bound is safe.
  let day = Math.max(anchorDay(rule), Math.floor((from - rule.duration + 1 + rule.tzOffset) / DAY_MS));
  const occurrences: BlockOccurrence[] = [];
  for (; ; day++) {
    const occStart = occurrenceStart(rule, day);
    if (occStart >= to) break;
    if (!ruleMatchesDay(rule, day)) continue;
    if (skippedDays !== undefined && skippedDays.has(day)) continue;
    const occEnd = occStart + rule.duration;
    if (occEnd <= from) continue;
    occurrences.push({
      ruleId: rule.id,
      day,
      occStart,
      occEnd,
      id: `${rule.id}:${day}`,
      name: rule.name,
      note: rule.note,
    });
  }
  return occurrences;
}

function frequencyMatches(rule: BlockRule, day: number): boolean {
  const anchor = anchorDay(rule);
  const date = civilFromDays(day);
  switch (rule.freq) {
    case 'daily':
      return (day - anchor) % rule.interval === 0;
    case 'weekly': {
      // Intervals count weeks from the Monday of the anchor's week.
      const weeks = (mondayOf(day) - mondayOf(anchor)) / 7;
      if (weeks % rule.interval !== 0) return false;
      const days = rule.byDay ?? [weekdayFromDays(anchor)];
      return days.includes(weekdayFromDays(day));
    }
    case 'monthly': {
      const months = (date.year - rule.startDate.year) * 12 + (date.month - rule.startDate.month);
      if (months % rule.interval !== 0) return false;
      const byMonthDay = rule.byMonthDay ?? (rule.byDay === undefined ? [rule.startDate.day] : undefined);
      if (byMonthDay !== undefined) return matchesMonthDay(byMonthDay, date.year, date.month, date.day);
      return matchesNthWeekday(rule, date.year, date.month, date.day);
    }
    case 'yearly': {
      if ((date.year - rule.startDate.year) % rule.interval !== 0) return false;
      const months = rule.byMonth ?? [rule.startDate.month];
      if (!months.includes(date.month)) return false;
      const days = rule.byMonthDay ?? [rule.startDate.day];
      return matchesMonthDay(days, date.year, date.month, date.day);
    }
  }
}

/** `-1` selects the last day of the month; a value the month lacks matches nothing. */
function matchesMonthDay(values: number[], year: number, month: number, day: number): boolean {
  return values.some((v) => (v === -1 ? day === daysInMonth(year, month) : v === day));
}

/** `bySetPos`: the nth (negative: from the end) day of the month matching `byDay`. */
function matchesNthWeekday(rule: BlockRule, year: number, month: number, day: number): boolean {
  const weekdays = rule.byDay;
  if (weekdays === undefined) return false;
  const matching: number[] = [];
  const total = daysInMonth(year, month);
  for (let d = 1; d <= total; d++) {
    if (weekdays.includes(weekdayFromDays(daysFromCivil(year, month, d)))) matching.push(d);
  }
  if (rule.bySetPos === undefined) return matching.includes(day);
  const pos = rule.bySetPos;
  const index = pos > 0 ? pos - 1 : matching.length + pos;
  return matching[index] === day;
}

function hasAnySelector(rule: BlockRule): boolean {
  return (
    rule.byDay !== undefined ||
    rule.byMonthDay !== undefined ||
    rule.byMonth !== undefined ||
    rule.bySetPos !== undefined
  );
}

function validateSelector(name: string, values: number[], min: number, max: number, allowLastDay = false): void {
  if (values.length === 0) throw new Error(`${name} must not be empty`);
  const seen = new Set<number>();
  for (const v of values) {
    const inRange = Number.isInteger(v) && ((v >= min && v <= max) || (allowLastDay && v === -1));
    if (!inRange) throw new Error(`${name} value out of range: ${v}`);
    if (seen.has(v)) throw new Error(`${name} values must be unique: ${v}`);
    seen.add(v);
  }
}

function validateSetPos(pos: number): void {
  if (!Number.isInteger(pos) || pos === 0 || Math.abs(pos) > 5) {
    throw new Error(`bySetPos must be a nonzero integer within +/-5: ${pos}`);
  }
}
