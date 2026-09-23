import { describe, expect, it } from 'vitest';
import {
  Calendar,
  DAY_MS,
  WorktreeState,
  daysFromCivil,
  expandRule,
  ruleMatchesDay,
  validateRule,
} from '../src/index';
import type { BlockRule, CalendarOperation, HistoryNode } from '../src/index';

type AddRuleOp = Extract<CalendarOperation, { kind: 'add_block_rule' }>;

const d = (year: number, month: number, day: number): number => daysFromCivil(year, month, day);
const at = (year: number, month: number, day: number, hour = 0): number => d(year, month, day) * DAY_MS + hour * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const rule = (over: Partial<BlockRule> = {}): BlockRule => ({
  id: 'r1',
  name: 'Standup',
  note: '',
  freq: 'daily',
  interval: 1,
  startDate: { year: 2026, month: 1, day: 1 },
  timeOfDay: { hour: 9, minute: 0 },
  duration: HOUR,
  tzOffset: 0,
  active: true,
  ...over,
});

const daysOf = (r: BlockRule, from: number, to: number, skips?: ReadonlySet<number>): number[] =>
  expandRule(r, skips, from, to).map((o) => o.day);

describe('validateRule', () => {
  it('accepts each frequency with its scoped selectors', () => {
    expect(() => validateRule(rule({ freq: 'daily' }))).not.toThrow();
    expect(() => validateRule(rule({ freq: 'weekly', byDay: [1, 3] }))).not.toThrow();
    expect(() => validateRule(rule({ freq: 'monthly', byMonthDay: [1, 15, -1] }))).not.toThrow();
    expect(() => validateRule(rule({ freq: 'monthly', byDay: [5], bySetPos: -1 }))).not.toThrow();
    expect(() =>
      validateRule(rule({ freq: 'yearly', byMonth: [10], byMonthDay: [1] })),
    ).not.toThrow();
  });

  it('rejects out-of-scope selectors', () => {
    expect(() => validateRule(rule({ freq: 'daily', byDay: [1] }))).toThrow(/daily rules take no selectors/);
    expect(() => validateRule(rule({ freq: 'weekly', byMonthDay: [1] }))).toThrow(/weekly rules take only byDay/);
    expect(() => validateRule(rule({ freq: 'weekly', bySetPos: 1 }))).toThrow(/weekly rules take only byDay/);
    expect(() => validateRule(rule({ freq: 'monthly', byMonth: [1] }))).toThrow(/not byMonth/);
    expect(() => validateRule(rule({ freq: 'monthly', byDay: [1], byMonthDay: [1] }))).toThrow(/not both/);
    expect(() => validateRule(rule({ freq: 'monthly', byMonthDay: [1], bySetPos: 1 }))).toThrow(/bySetPos requires byDay/);
    expect(() => validateRule(rule({ freq: 'yearly', byDay: [1] }))).toThrow(/yearly rules take byMonth and byMonthDay/);
  });

  it('rejects out-of-range and malformed selector values', () => {
    expect(() => validateRule(rule({ freq: 'weekly', byDay: [] }))).toThrow(/byDay must not be empty/);
    expect(() => validateRule(rule({ freq: 'weekly', byDay: [7] }))).toThrow(/byDay value out of range/);
    expect(() => validateRule(rule({ freq: 'weekly', byDay: [1, 1] }))).toThrow(/byDay values must be unique/);
    expect(() => validateRule(rule({ freq: 'monthly', byMonthDay: [0] }))).toThrow(/byMonthDay value out of range/);
    expect(() => validateRule(rule({ freq: 'monthly', byMonthDay: [32] }))).toThrow(/byMonthDay value out of range/);
    expect(() => validateRule(rule({ freq: 'monthly', byDay: [4], bySetPos: 0 }))).toThrow(/bySetPos must be a nonzero/);
    expect(() => validateRule(rule({ freq: 'monthly', byDay: [4], bySetPos: 6 }))).toThrow(/bySetPos must be a nonzero/);
    expect(() => validateRule(rule({ freq: 'yearly', byMonth: [13] }))).toThrow(/byMonth value out of range/);
  });

  it('rejects malformed dates, times, durations and offsets', () => {
    expect(() => validateRule(rule({ startDate: { year: 2026, month: 2, day: 30 } }))).toThrow(/invalid rule start date/);
    expect(() => validateRule(rule({ startDate: { year: 1969, month: 12, day: 31 } }))).toThrow(/before 1970-01-01/);
    expect(() => validateRule(rule({ timeOfDay: { hour: 24, minute: 0 } }))).toThrow(/hour out of range/);
    expect(() => validateRule(rule({ timeOfDay: { hour: 0, minute: 60 } }))).toThrow(/minute out of range/);
    expect(() => validateRule(rule({ duration: 0 }))).toThrow(/duration must be a positive/);
    expect(() => validateRule(rule({ duration: 1.5 }))).toThrow(/duration must be a positive/);
    expect(() => validateRule(rule({ interval: 0 }))).toThrow(/interval must be a positive integer/);
    expect(() => validateRule(rule({ interval: 1.5 }))).toThrow(/interval must be a positive integer/);
    expect(() => validateRule(rule({ tzOffset: 1000 }))).toThrow(/tz offset must be whole minutes/);
    expect(() => validateRule(rule({ until: -1 }))).toThrow(/until must be a non-negative/);
    expect(() => validateRule(rule({ name: '' }))).toThrow(/name must not be empty/);
  });
});

describe('ruleMatchesDay', () => {
  it('never matches a day before the anchor', () => {
    const weekly = rule({ freq: 'weekly', startDate: { year: 2026, month: 9, day: 23 }, byDay: [1, 3] });
    expect(ruleMatchesDay(weekly, d(2026, 9, 21))).toBe(false); // the anchor week's Monday
    expect(ruleMatchesDay(weekly, d(2026, 9, 23))).toBe(true);
    expect(ruleMatchesDay(weekly, d(2026, 9, 28))).toBe(true);
  });

  it('treats until as an upper bound on the occurrence start', () => {
    const until = at(2026, 1, 3, 9);
    const daily = rule({ until });
    expect(ruleMatchesDay(daily, d(2026, 1, 3))).toBe(true);
    expect(ruleMatchesDay(daily, d(2026, 1, 4))).toBe(false);
    const shifted = rule({ until, timeOfDay: { hour: 9, minute: 1 } });
    expect(ruleMatchesDay(shifted, d(2026, 1, 3))).toBe(false);
  });

  it('ignores active (skip validation uses the schedule, not the switch)', () => {
    expect(ruleMatchesDay(rule({ active: false }), d(2026, 1, 5))).toBe(true);
  });
});

describe('expandRule', () => {
  it('daily: interval counts days from the anchor', () => {
    const r = rule({ freq: 'daily', interval: 3 });
    expect(daysOf(r, at(2026, 1, 1), at(2026, 1, 15))).toEqual([d(2026, 1, 1), d(2026, 1, 4), d(2026, 1, 7), d(2026, 1, 10), d(2026, 1, 13)]);
  });

  it('window is half-open: occStart === to is out, occEnd === from is out', () => {
    const r = rule(); // daily 09:00, one hour
    const occStart = at(2026, 1, 5, 9);
    const occEnd = occStart + HOUR;
    expect(daysOf(r, occStart, occEnd)).toEqual([d(2026, 1, 5)]);
    expect(daysOf(r, occStart, occStart + 1)).toEqual([d(2026, 1, 5)]);
    expect(daysOf(r, occStart - 1000, occStart)).toEqual([]);
    expect(daysOf(r, occEnd, occEnd + DAY_MS)).toEqual([d(2026, 1, 6)]);
  });

  it('weekly: intervals count weeks from the anchor Monday, multiple byDay entries', () => {
    const r = rule({ freq: 'weekly', interval: 2, startDate: { year: 2026, month: 9, day: 23 }, byDay: [1, 3] });
    expect(daysOf(r, at(2026, 9, 20), at(2026, 10, 20))).toEqual([
      d(2026, 9, 23), // the anchor week (its Monday is before the anchor)
      d(2026, 10, 5),
      d(2026, 10, 7),
      d(2026, 10, 19),
    ]);
  });

  it('weekly: byDay defaults to the anchor weekday', () => {
    const r = rule({ freq: 'weekly', startDate: { year: 2026, month: 9, day: 23 } });
    expect(daysOf(r, at(2026, 9, 20), at(2026, 10, 10))).toEqual([d(2026, 9, 23), d(2026, 9, 30), d(2026, 10, 7)]);
  });

  it('monthly: byMonthDay defaults to the anchor day', () => {
    const r = rule({ freq: 'monthly', startDate: { year: 2026, month: 1, day: 15 } });
    expect(daysOf(r, at(2026, 1, 1), at(2026, 4, 1))).toEqual([d(2026, 1, 15), d(2026, 2, 15), d(2026, 3, 15)]);
  });

  it('monthly: interval counts months from the anchor month', () => {
    const r = rule({ freq: 'monthly', interval: 2, startDate: { year: 2026, month: 1, day: 15 } });
    expect(daysOf(r, at(2026, 1, 1), at(2026, 6, 1))).toEqual([d(2026, 1, 15), d(2026, 3, 15), d(2026, 5, 15)]);
  });

  it('monthly: day 31 skips short months instead of clamping', () => {
    const r = rule({ freq: 'monthly', startDate: { year: 2026, month: 1, day: 31 } });
    expect(daysOf(r, at(2026, 1, 1), at(2027, 1, 1))).toEqual([
      d(2026, 1, 31),
      d(2026, 3, 31),
      d(2026, 5, 31),
      d(2026, 7, 31),
      d(2026, 8, 31),
      d(2026, 10, 31),
      d(2026, 12, 31),
    ]);
    const leap = rule({ freq: 'monthly', startDate: { year: 2028, month: 1, day: 31 } });
    expect(daysOf(leap, at(2028, 2, 1), at(2028, 3, 1))).toEqual([]); // Feb 2028 has 29 days
    expect(daysOf(rule({ freq: 'monthly', byMonthDay: [29], startDate: { year: 2028, month: 1, day: 1 } }), at(2028, 2, 1), at(2028, 3, 1))).toEqual([d(2028, 2, 29)]);
  });

  it('monthly: -1 is the last day of the month', () => {
    const r = rule({ freq: 'monthly', byMonthDay: [-1], startDate: { year: 2026, month: 1, day: 1 } });
    expect(daysOf(r, at(2026, 1, 1), at(2026, 5, 1))).toEqual([
      d(2026, 1, 31),
      d(2026, 2, 28),
      d(2026, 3, 31),
      d(2026, 4, 30),
    ]);
  });

  it('monthly: bySetPos picks the nth / last weekday of the month', () => {
    const first = rule({ freq: 'monthly', byDay: [5], bySetPos: 1, startDate: { year: 2026, month: 1, day: 1 } });
    expect(daysOf(first, at(2026, 1, 1), at(2026, 3, 1))).toEqual([d(2026, 1, 2), d(2026, 2, 6)]);
    const last = rule({ freq: 'monthly', byDay: [5], bySetPos: -1, startDate: { year: 2026, month: 1, day: 1 } });
    expect(daysOf(last, at(2026, 1, 1), at(2026, 3, 1))).toEqual([d(2026, 1, 30), d(2026, 2, 27)]);
    // A fifth Wednesday only exists in some months (Feb 2026 has four).
    const fifth = rule({ freq: 'monthly', byDay: [3], bySetPos: 5, startDate: { year: 2026, month: 1, day: 1 } });
    expect(daysOf(fifth, at(2026, 2, 1), at(2026, 3, 1))).toEqual([]);
  });

  it('yearly: byMonth + byMonthDay, Feb 29 only in leap years', () => {
    const r = rule({ freq: 'yearly', byMonth: [10], byMonthDay: [1], startDate: { year: 2026, month: 1, day: 1 } });
    expect(daysOf(r, at(2026, 1, 1), at(2028, 1, 1))).toEqual([d(2026, 10, 1), d(2027, 10, 1)]);
    const leapDay = rule({ freq: 'yearly', byMonth: [2], byMonthDay: [29], startDate: { year: 2024, month: 2, day: 29 } });
    expect(daysOf(leapDay, at(2024, 1, 1), at(2029, 1, 1))).toEqual([d(2024, 2, 29), d(2028, 2, 29)]);
  });

  it('yearly: interval counts years from the anchor year', () => {
    const r = rule({ freq: 'yearly', interval: 2, startDate: { year: 2026, month: 3, day: 10 } });
    expect(daysOf(r, at(2025, 1, 1), at(2031, 1, 1))).toEqual([d(2026, 3, 10), d(2028, 3, 10), d(2030, 3, 10)]);
  });

  it('until is inclusive of the occurrence start', () => {
    const r = rule({ until: at(2026, 1, 3, 9) });
    expect(daysOf(r, at(2026, 1, 1), at(2026, 2, 1))).toEqual([d(2026, 1, 1), d(2026, 1, 2), d(2026, 1, 3)]);
  });

  it('finds occurrences whose start is before the window (long duration)', () => {
    const r = rule({ freq: 'daily', interval: 5, duration: 3 * DAY_MS });
    expect(daysOf(r, at(2026, 1, 8), at(2026, 1, 12))).toEqual([d(2026, 1, 6), d(2026, 1, 11)]);
  });

  it('excludes skipped days and contributes nothing while inactive', () => {
    const r = rule({ freq: 'daily' });
    expect(daysOf(r, at(2026, 1, 1), at(2026, 1, 4), new Set([d(2026, 1, 2)]))).toEqual([
      d(2026, 1, 1),
      d(2026, 1, 3),
    ]);
    expect(daysOf(rule({ active: false }), at(2026, 1, 1), at(2026, 2, 1))).toEqual([]);
  });

  it('uses the rule offset for day keys and instants', () => {
    const offset = 8 * 60 * 60 * 1000;
    const r = rule({ freq: 'daily', tzOffset: offset, timeOfDay: { hour: 9, minute: 0 } });
    const [occ] = expandRule(r, undefined, at(2026, 9, 23), at(2026, 9, 24));
    expect(occ.day).toBe(d(2026, 9, 23));
    expect(new Date(occ.occStart).toISOString()).toBe('2026-09-23T01:00:00.000Z');
    expect(occ.occEnd - occ.occStart).toBe(HOUR);
    expect(occ.id).toBe(`r1:${d(2026, 9, 23)}`);
    expect(occ.name).toBe('Standup');
    expect(occ.note).toBe('');
  });

  it('is deterministic across repeated expansion', () => {
    const r = rule({ freq: 'monthly', byDay: [3], bySetPos: -1, startDate: { year: 2026, month: 1, day: 1 } });
    const from = at(2026, 1, 1);
    const to = at(2027, 1, 1);
    expect(expandRule(r, undefined, from, to)).toEqual(expandRule(r, undefined, from, to));
  });
});

describe('Calendar rules and exceptions', () => {
  const addRule = (id: string, over: Partial<BlockRule> = {}): AddRuleOp => {
    const r = rule({ id, ...over });
    return {
      kind: 'add_block_rule',
      id,
      name: r.name,
      freq: r.freq,
      interval: r.interval,
      startDate: r.startDate,
      timeOfDay: r.timeOfDay,
      duration: r.duration,
      byDay: r.byDay,
      byMonthDay: r.byMonthDay,
      byMonth: r.byMonth,
      bySetPos: r.bySetPos,
      until: r.until,
      tzOffset: r.tzOffset,
      note: r.note,
    };
  };

  it('adds, lists and removes rules; remove is idempotent', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1'));
    calendar.apply(addRule('r2', { name: 'Other', freq: 'weekly' }));
    expect(calendar.getRules().map((r) => r.name)).toEqual(['Standup', 'Other']);
    expect(calendar.ruleCount()).toBe(2);
    expect(calendar.getRules()[0]).toMatchObject({ note: '', active: true, tzOffset: 0 });
    calendar.apply({ kind: 'remove_block_rule', id: 'r1' });
    calendar.apply({ kind: 'remove_block_rule', id: 'r1' });
    calendar.apply({ kind: 'remove_block_rule', id: 'missing' });
    expect(calendar.getRules().map((r) => r.id)).toEqual(['r2']);
  });

  it('rejects a duplicate rule id and a rule that fails validation', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1'));
    expect(() => calendar.apply(addRule('r1'))).toThrow(/duplicate rule id/);
    expect(() => calendar.apply(addRule('r2', { freq: 'daily', byDay: [1] }))).toThrow(/daily rules take no selectors/);
  });

  it('edits a rule with a partial patch and clears fields with null', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1', { freq: 'monthly', byMonthDay: [1, 5], note: 'n' }));
    calendar.apply({ kind: 'edit_block_rule', id: 'r1', name: 'Renamed', note: '', active: false });
    expect(calendar.getRules()[0]).toMatchObject({ name: 'Renamed', note: '', active: false, byMonthDay: [1, 5] });
    calendar.apply({ kind: 'edit_block_rule', id: 'r1', byMonthDay: null });
    expect(calendar.getRules()[0].byMonthDay).toBeUndefined();
    expect(calendar.getRules()[0].freq).toBe('monthly');
  });

  it('rejects an empty patch, an unknown id and a patch that breaks validation', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1'));
    expect(() => calendar.apply({ kind: 'edit_block_rule', id: 'r1' })).toThrow(/patch is empty/);
    expect(() => calendar.apply({ kind: 'edit_block_rule', id: 'missing', name: 'x' })).toThrow(/unknown rule id/);
    expect(() => calendar.apply({ kind: 'edit_block_rule', id: 'r1', name: '' })).toThrow(/name must not be empty/);
    expect(() => calendar.apply({ kind: 'edit_block_rule', id: 'r1', byDay: [1] })).toThrow(/daily rules take no selectors/);
    expect(() => calendar.apply({ kind: 'edit_block_rule', id: 'r1', until: at(2026, 1, 1, 9) })).not.toThrow();
  });

  it('a freq patch resets the selectors it does not supply', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1', { freq: 'monthly', byMonthDay: [15] }));
    calendar.apply({ kind: 'edit_block_rule', id: 'r1', freq: 'weekly' });
    expect(calendar.getRules()[0].freq).toBe('weekly');
    expect(calendar.getRules()[0].byMonthDay).toBeUndefined();
    // Stating the pattern in the same patch keeps the new selectors.
    calendar.apply({ kind: 'edit_block_rule', id: 'r1', freq: 'monthly', byDay: [3], bySetPos: 1 });
    expect(calendar.getRules()[0]).toMatchObject({ freq: 'monthly', byDay: [3], bySetPos: 1, byMonthDay: undefined });
  });

  it('keeps tzOffset across edits', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1', { tzOffset: 8 * 60 * 60 * 1000 }));
    calendar.apply({ kind: 'edit_block_rule', id: 'r1', timeOfDay: { hour: 7, minute: 30 } });
    expect(calendar.getRules()[0]).toMatchObject({ tzOffset: 8 * 60 * 60 * 1000, timeOfDay: { hour: 7, minute: 30 } });
  });

  it('skip_occurrence rejects an unknown rule and a non-occurrence day', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1', { freq: 'weekly', startDate: { year: 2026, month: 9, day: 23 }, byDay: [3] }));
    expect(() => calendar.apply({ kind: 'skip_occurrence', ruleId: 'missing', day: d(2026, 9, 23) })).toThrow(/unknown rule id/);
    expect(() => calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 9, 24) })).toThrow(/day is not an occurrence/);
    expect(() => calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 9, 16) })).toThrow(/day is not an occurrence/);
    expect(() => calendar.apply({ kind: 'unskip_occurrence', ruleId: 'r1', day: d(2026, 9, 24) })).toThrow(/day is not an occurrence/);
    expect(() => calendar.apply({ kind: 'unskip_occurrence', ruleId: 'missing', day: d(2026, 9, 23) })).toThrow(/unknown rule id/);
  });

  it('skip and unskip are idempotent and ordered', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1', { freq: 'daily' }));
    calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 3) });
    expect(calendar.getSkips('r1')).toEqual([d(2026, 1, 3), d(2026, 1, 5)]);
    calendar.apply({ kind: 'unskip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    calendar.apply({ kind: 'unskip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    expect(calendar.getSkips('r1')).toEqual([d(2026, 1, 3)]);
    expect(calendar.getSkips('missing')).toEqual([]);
    expect(calendar.expand(at(2026, 1, 1), at(2026, 1, 6)).map((o) => o.day)).toEqual([
      d(2026, 1, 1),
      d(2026, 1, 2),
      d(2026, 1, 4),
      d(2026, 1, 5),
    ]);
  });

  it('clears a rule\'s skips when the patch touches the day set', () => {
    const day = d(2026, 1, 5);
    for (const patch of [
      { freq: 'daily' as const, interval: 2 },
      { interval: 2 },
      { startDate: { year: 2026, month: 1, day: 2 } },
      { byDay: [1] },
      { byMonthDay: [5] },
      { byMonth: [1] },
      { bySetPos: 1 },
      { until: at(2026, 2, 1) },
    ]) {
      const calendar = new Calendar();
      calendar.apply(addRule('r1', { freq: 'monthly', byMonthDay: [5] }));
      calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day });
      expect(calendar.getSkips('r1')).toEqual([day]);
      try {
        calendar.apply({ kind: 'edit_block_rule', id: 'r1', ...patch });
      } catch {
        // the patch may not be valid for the rule; the skips must be kept then
        expect(calendar.getSkips('r1')).toEqual([day]);
        continue;
      }
      expect(calendar.getSkips('r1')).toEqual([]);
    }
  });

  it('keeps a rule\'s skips when the patch does not touch the day set', () => {
    const day = d(2026, 1, 5);
    for (const patch of [
      { name: 'Other' },
      { note: 'n' },
      { active: false },
      { timeOfDay: { hour: 10, minute: 30 } },
      { duration: 2 * HOUR },
    ]) {
      const calendar = new Calendar();
      calendar.apply(addRule('r1', { freq: 'monthly', byMonthDay: [5] }));
      calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day });
      calendar.apply({ kind: 'edit_block_rule', id: 'r1', ...patch });
      expect(calendar.getSkips('r1')).toEqual([day]);
    }
  });

  it('remove_block_rule drops the rule\'s skips', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1'));
    calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    calendar.apply({ kind: 'remove_block_rule', id: 'r1' });
    expect(calendar.getSkips('r1')).toEqual([]);
    expect(calendar.expand(at(2026, 1, 1), at(2026, 1, 10))).toEqual([]);
  });

  it('skips an inactive rule\'s occurrences (they stay listed as exceptions)', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1'));
    calendar.apply({ kind: 'edit_block_rule', id: 'r1', active: false });
    calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    expect(calendar.expand(at(2026, 1, 1), at(2026, 1, 10))).toEqual([]);
    expect(calendar.getSkips('r1')).toEqual([d(2026, 1, 5)]);
  });

  it('rejects a skip past until (not an occurrence)', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r1', { until: at(2026, 1, 3, 9) }));
    expect(() => calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 4) })).toThrow(
      /day is not an occurrence/,
    );
    expect(() => calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 3) })).not.toThrow();
  });

  it('expands all rules ordered by (occStart, ruleId)', () => {
    const calendar = new Calendar();
    calendar.apply(addRule('r-b'));
    calendar.apply(addRule('r-a'));
    calendar.apply(addRule('r-c', { timeOfDay: { hour: 10, minute: 0 } }));
    expect(calendar.expand(at(2026, 1, 1), at(2026, 1, 2)).map((o) => o.id)).toEqual([
      `r-a:${d(2026, 1, 1)}`,
      `r-b:${d(2026, 1, 1)}`,
      `r-c:${d(2026, 1, 1)}`,
    ]);
  });

  it('blocks and rules coexist and clone() deep-copies rules and skips', () => {
    const calendar = new Calendar();
    calendar.apply({ kind: 'add_block', id: 'b1', name: 'B', start: 0, end: 10 });
    calendar.apply(addRule('r1'));
    calendar.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) });
    const copy = calendar.clone();
    copy.apply({ kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 6) });
    copy.apply({ kind: 'edit_block_rule', id: 'r1', name: 'Changed' });
    copy.apply({ kind: 'remove_block_rule', id: 'r1' });
    expect(calendar.getSkips('r1')).toEqual([d(2026, 1, 5)]);
    expect(calendar.getRules()[0].name).toBe('Standup');
    expect(calendar.blockCount()).toBe(1);
    expect(calendar.expand(at(2026, 1, 1), at(2026, 1, 7)).map((o) => o.day)).toEqual([
      d(2026, 1, 1),
      d(2026, 1, 2),
      d(2026, 1, 3),
      d(2026, 1, 4),
      d(2026, 1, 6),
    ]);
  });
});

describe('rule ops through WorktreeState', () => {
  const history = (ops: HistoryNode['op'][]): HistoryNode[] =>
    ops.map((op, i) => ({ id: `h${i}`, op }));

  it('routes rule ops to the calendar and leaves the tree untouched', () => {
    const state = WorktreeState.fromOps([
      { kind: 'add', parentId: 'root', id: 'n1', name: 'Task', weight: 1 },
      { kind: 'add_block', id: 'b1', name: 'Block', start: 0, end: 10, nodeId: 'n1' },
      {
        kind: 'add_block_rule',
        id: 'r1',
        name: 'Standup',
        freq: 'daily' as const,
        interval: 1,
        startDate: { year: 2026, month: 1, day: 1 },
        timeOfDay: { hour: 9, minute: 0 },
        duration: HOUR,
        tzOffset: 0,
      },
      { kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) },
    ]);
    expect(state.calendar.getRules().map((r) => r.id)).toEqual(['r1']);
    expect(state.calendar.getSkips('r1')).toEqual([d(2026, 1, 5)]);
    expect(state.tree.nodeCount()).toBe(1);
    expect(state.calendar.blockCount()).toBe(1);
    expect(state.calendar.getBlocks()[0].status).toBe(false);
  });

  it('replays a stranded skip as a replay failure, never silently', () => {
    // The rule `add` is dropped by a repair, so its skip no longer applies.
    const history = [
      { kind: 'remove_block_rule' as const, id: 'r1' },
      { kind: 'skip_occurrence' as const, ruleId: 'r1', day: d(2026, 1, 5) },
    ];
    let error: unknown;
    try {
      WorktreeState.fromOps(history);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('unknown rule id');
  });

  it('clones rules and skips with the state', () => {
    const state = WorktreeState.fromOps([
      {
        kind: 'add_block_rule',
        id: 'r1',
        name: 'Standup',
        freq: 'daily' as const,
        interval: 1,
        startDate: { year: 2026, month: 1, day: 1 },
        timeOfDay: { hour: 9, minute: 0 },
        duration: HOUR,
        tzOffset: 0,
      },
      { kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 5) },
    ]);
    const copy = state.clone();
    copy.apply({ kind: 'remove_block_rule', id: 'r1' });
    expect(state.calendar.ruleCount()).toBe(1);
    expect(state.calendar.getSkips('r1')).toEqual([d(2026, 1, 5)]);
    expect(copy.calendar.ruleCount()).toBe(0);
  });

  it('replays the same history to the same state', () => {
    const nodes = history([
      {
        kind: 'add_block_rule',
        id: 'r1',
        name: 'Standup',
        freq: 'monthly' as const,
        interval: 1,
        startDate: { year: 2026, month: 1, day: 1 },
        timeOfDay: { hour: 9, minute: 0 },
        duration: HOUR,
        byDay: [3],
        bySetPos: -1,
        tzOffset: 8 * 60 * 60 * 1000,
      },
      { kind: 'skip_occurrence', ruleId: 'r1', day: d(2026, 1, 28) },
    ]);
    const first = WorktreeState.fromOps(nodes.map((n) => n.op));
    const second = WorktreeState.fromOps(nodes.map((n) => n.op));
    expect(first.calendar.getRules()).toEqual(second.calendar.getRules());
    expect(first.calendar.expand(at(2026, 1, 1), at(2026, 6, 1))).toEqual(
      second.calendar.expand(at(2026, 1, 1), at(2026, 6, 1)),
    );
  });
});
