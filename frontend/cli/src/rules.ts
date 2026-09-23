import type { CivilDate, CivilTime, RuleFreq, Timestamp } from '@worktree/core';
import { daysFromCivil, endOfCivilDay, parseCivilDate } from '@worktree/core';

/**
 * Command-line grammar for `rule ...`, kept out of commands.ts so the argument
 * forms are unit-testable. Every field is scoped by the effective frequency:
 * `day=mon` is a weekday of a weekly rule (or of a monthly rule, meaning every
 * such weekday), `day=2nd-tue` is a monthly nth weekday, `mday=`/`month=`
 * belong to monthly/yearly rules.
 */

/** Absent = unchanged, null = clear (only ever produced when editing). */
export interface ParsedRuleFields {
  name?: string;
  note?: string;
  freq?: RuleFreq;
  interval?: number;
  startDate?: CivilDate;
  timeOfDay?: CivilTime;
  duration?: Timestamp;
  byDay?: number[] | null;
  byMonthDay?: number[] | null;
  byMonth?: number[] | null;
  bySetPos?: number | null;
  until?: Timestamp | null;
  active?: boolean;
  tzOffset?: Timestamp;
}

/** `freq` is the effective frequency: always present, and mirrored into
 *  `fields` only when the command line spelled it out (an edit patch must not
 *  restate the frequency, which would reset the rule's selectors). */
export type RuleParseResult =
  | { ok: true; freq: RuleFreq; fields: ParsedRuleFields }
  | { ok: false; error: string };

export interface RuleParseOptions {
  mode: 'add' | 'edit';
  /** Frequency scoping the selectors; editing falls back to the rule's own. */
  freq?: RuleFreq;
  /** Offset used to resolve `until=YYYY-MM-DD` to the end of that civil day. */
  tzOffset: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/** What each frequency accepts, for error messages. */
const SELECTOR_HINT: Record<RuleFreq, string> = {
  daily: 'daily rules take no day=, mday= or month=',
  weekly: 'weekly rules take day=mon,wed',
  monthly: 'monthly rules take day=mon,wed | day=2nd-tue | mday=15,last',
  yearly: 'yearly rules take month=3 and mday=15',
};

const ALLOWED_SELECTORS: Record<RuleFreq, string[]> = {
  daily: [],
  weekly: ['day'],
  monthly: ['day', 'mday'],
  yearly: ['mday', 'month'],
};

/** A weekday selector as written: plain days, or nth days of the month. */
type DaySpec = { kind: 'plain'; days: number[] } | { kind: 'nth'; days: number[]; pos: number };

interface RawFields {
  name?: string;
  note?: string;
  freq?: string;
  interval?: string;
  from?: string;
  time?: string;
  dur?: string;
  day?: string;
  mday?: string;
  month?: string;
  until?: string;
  active?: string;
  tz?: string;
}

export function parseRuleFields(args: string[], opts: RuleParseOptions): RuleParseResult {
  const raw: RawFields = {};
  for (const kv of args) {
    const eq = kv.indexOf('=');
    if (eq <= 0) return fail(`invalid key=value: ${kv}`);
    const key = kv.slice(0, eq);
    const value = kv.slice(eq + 1);
    if (
      key === 'name' ||
      key === 'note' ||
      key === 'freq' ||
      key === 'interval' ||
      key === 'from' ||
      key === 'time' ||
      key === 'dur' ||
      key === 'day' ||
      key === 'mday' ||
      key === 'month' ||
      key === 'until' ||
      key === 'active' ||
      key === 'tz'
    ) {
      raw[key] = value;
    } else {
      return fail(`unknown field: ${key}`);
    }
  }

  if (raw.tz !== undefined && opts.mode === 'edit') {
    return fail('tz= cannot be changed after creation (edit the rule\'s time= instead)');
  }
  if (raw.active !== undefined && opts.mode === 'add') {
    return fail('active= only makes sense when editing (new rules are active)');
  }
  if (raw.until === 'null' && opts.mode === 'add') return fail('until=null only makes sense when editing');

  let tzOffset = opts.tzOffset;
  if (raw.tz !== undefined) {
    const parsed = parseTzOffset(raw.tz);
    if (parsed === null) return fail(`invalid tz: ${raw.tz} (use +HH:MM or -HH:MM)`);
    tzOffset = parsed;
  }

  let freq = opts.freq;
  if (raw.freq !== undefined) {
    const parsed = parseFreq(raw.freq);
    if (parsed === null) return fail(`invalid freq: ${raw.freq} (use daily|weekly|monthly|yearly)`);
    freq = parsed;
  }
  if (freq === undefined) return fail('freq is required (daily|weekly|monthly|yearly)');

  const fields: ParsedRuleFields = {};
  if (raw.freq !== undefined) fields.freq = freq;
  if (raw.name !== undefined) {
    if (raw.name === '') return fail('name must not be empty');
    fields.name = raw.name;
  }
  if (raw.note !== undefined) fields.note = raw.note;
  if (raw.interval !== undefined) {
    const interval = Number(raw.interval);
    if (!Number.isInteger(interval) || interval < 1) {
      return fail(`invalid interval: ${raw.interval} (use a positive integer)`);
    }
    fields.interval = interval;
  }
  if (raw.from !== undefined) {
    const date = parseCivilDate(raw.from);
    if (date === null) return fail(`invalid date: ${raw.from} (use YYYY-MM-DD)`);
    fields.startDate = date;
  }
  if (raw.time !== undefined) {
    const time = parseTimeOfDay(raw.time);
    if (time === null) return fail(`invalid time: ${raw.time} (use HH:MM)`);
    fields.timeOfDay = time;
  }
  if (raw.dur !== undefined) {
    const duration = parseDuration(raw.dur);
    if (duration === null) return fail(`invalid duration: ${raw.dur} (use 90m, 2h, 1h30m or 5400000ms)`);
    fields.duration = duration;
  }
  if (raw.until !== undefined) {
    if (raw.until === 'null' || raw.until === '') {
      fields.until = null;
    } else {
      const date = parseCivilDate(raw.until);
      if (date === null) return fail(`invalid date: ${raw.until} (use YYYY-MM-DD)`);
      fields.until = endOfCivilDay(daysFromCivil(date.year, date.month, date.day), tzOffset);
    }
  }
  if (raw.active !== undefined) {
    if (raw.active !== 'true' && raw.active !== 'false') {
      return fail(`invalid active: ${raw.active} (use true or false)`);
    }
    fields.active = raw.active === 'true';
  }
  if (raw.tz !== undefined) fields.tzOffset = tzOffset;

  const selectors = resolveSelectors(freq, raw, opts.mode);
  if (!selectors.ok) return selectors;
  return { ok: true, freq, fields: { ...fields, ...selectors.fields } };
}

function fail(error: string): RuleParseResult {
  return { ok: false, error };
}

function parseFreq(value: string): RuleFreq | null {
  if (value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly') return value;
  return null;
}

/**
 * Map the `day=` / `mday=` / `month=` arguments onto the selectors the
 * frequency uses, clearing the ones it does not (editing only: on a new rule
 * an absent selector simply falls back to core's anchor-day defaults).
 */
function resolveSelectors(
  freq: RuleFreq,
  raw: RawFields,
  mode: 'add' | 'edit',
): { ok: true; fields: ParsedRuleFields } | { ok: false; error: string } {
  const supplied = (['day', 'mday', 'month'] as const).filter((key) => raw[key] !== undefined);
  if (supplied.length === 0) return { ok: true, fields: {} };
  const allowed = ALLOWED_SELECTORS[freq];
  for (const key of supplied) {
    if (!allowed.includes(key)) {
      return { ok: false, error: `${key}= is not valid here — ${SELECTOR_HINT[freq]}` };
    }
  }
  // `undefined` on add (nothing to clear), `null` on edit (clear the others).
  const clear = mode === 'edit' ? null : undefined;

  if (freq === 'weekly' && raw.day !== undefined) {
    const spec = parseDaySpec(raw.day);
    if (!spec.ok) return spec;
    if (spec.spec.kind === 'nth') return { ok: false, error: `weekly rules take plain weekdays — ${SELECTOR_HINT.weekly}` };
    return { ok: true, fields: { byDay: spec.spec.days, byMonthDay: clear, byMonth: clear, bySetPos: clear } };
  }

  if (freq === 'monthly' && raw.day !== undefined && raw.mday !== undefined) {
    return { ok: false, error: 'monthly rules take day= or mday=, not both' };
  }
  if (freq === 'monthly' && raw.day !== undefined) {
    const spec = parseDaySpec(raw.day);
    if (!spec.ok) return spec;
    if (spec.spec.kind === 'nth') {
      return {
        ok: true,
        fields: { byDay: spec.spec.days, bySetPos: spec.spec.pos, byMonthDay: clear, byMonth: clear },
      };
    }
    return { ok: true, fields: { byDay: spec.spec.days, bySetPos: clear, byMonthDay: clear, byMonth: clear } };
  }
  if (freq === 'monthly' && raw.mday !== undefined) {
    const days = parseMonthDays(raw.mday);
    if (!days.ok) return days;
    return { ok: true, fields: { byMonthDay: days.value, byDay: clear, bySetPos: clear, byMonth: clear } };
  }

  // Yearly: month= and mday= are independent and may be given together.
  const yearly: ParsedRuleFields = { byDay: clear, bySetPos: clear };
  if (raw.month !== undefined) {
    const months = parseMonths(raw.month);
    if (!months.ok) return months;
    yearly.byMonth = months.value;
  }
  if (raw.mday !== undefined) {
    const days = parseMonthDays(raw.mday);
    if (!days.ok) return days;
    yearly.byMonthDay = days.value;
  }
  return { ok: true, fields: yearly };
}

function parseDaySpec(text: string): { ok: true; spec: DaySpec } | { ok: false; error: string } {
  const parts = text.split(',').map((p) => p.trim());
  let pos: number | null = null;
  let plain = false;
  const days: number[] = [];
  for (const part of parts) {
    const dash = part.indexOf('-');
    if (dash === -1) {
      if (pos !== null) return { ok: false, error: `cannot mix plain and nth weekdays: ${text}` };
      const day = WEEKDAYS[part.toLowerCase()];
      if (day === undefined) return { ok: false, error: `invalid weekday: ${part}` };
      if (days.includes(day)) return { ok: false, error: `duplicate weekday: ${part}` };
      plain = true;
      days.push(day);
      continue;
    }
    const head = part.slice(0, dash).trim();
    const tail = part.slice(dash + 1).trim();
    if (plain) return { ok: false, error: `cannot mix plain and nth weekdays: ${text}` };
    const nth = head.toLowerCase() === 'last' ? -1 : parseNth(head);
    if (nth === null) return { ok: false, error: `invalid nth weekday: ${part}` };
    if (pos !== null && pos !== nth) return { ok: false, error: `nth weekdays must share one position: ${text}` };
    const day = WEEKDAYS[tail.toLowerCase()];
    if (day === undefined) return { ok: false, error: `invalid weekday: ${tail}` };
    if (days.includes(day)) return { ok: false, error: `duplicate weekday: ${tail}` };
    pos = nth;
    days.push(day);
  }
  if (days.length === 0) return { ok: false, error: `no weekdays given: ${text}` };
  return pos === null ? { ok: true, spec: { kind: 'plain', days } } : { ok: true, spec: { kind: 'nth', days, pos } };
}

/** `1st`..`5th`, or null when malformed. */
function parseNth(head: string): number | null {
  const m = /^([1-5])(st|nd|rd|th)$/.exec(head.toLowerCase());
  return m === null ? null : Number(m[1]);
}

function parseMonthDays(text: string): { ok: true; value: number[] } | { ok: false; error: string } {
  const value: number[] = [];
  for (const part of text.split(',').map((p) => p.trim())) {
    let day: number;
    if (part.toLowerCase() === 'last') day = -1;
    else {
      const n = Number(part);
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        return { ok: false, error: `invalid month day: ${part} (use 1..31 or last)` };
      }
      day = n;
    }
    if (value.includes(day)) return { ok: false, error: `duplicate month day: ${part}` };
    value.push(day);
  }
  if (value.length === 0) return { ok: false, error: `no month days given: ${text}` };
  return { ok: true, value };
}

function parseMonths(text: string): { ok: true; value: number[] } | { ok: false; error: string } {
  const value: number[] = [];
  for (const part of text.split(',').map((p) => p.trim())) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1 || n > 12) {
      return { ok: false, error: `invalid month: ${part} (use 1..12)` };
    }
    if (value.includes(n)) return { ok: false, error: `duplicate month: ${part}` };
    value.push(n);
  }
  if (value.length === 0) return { ok: false, error: `no months given: ${text}` };
  return { ok: true, value };
}

function parseTimeOfDay(text: string): CivilTime | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (m === null) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function parseDuration(text: string): Timestamp | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)ms)?$/.exec(text);
  if (m === null || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  const hours = m[1] !== undefined ? Number(m[1]) : 0;
  const minutes = m[2] !== undefined ? Number(m[2]) : 0;
  const ms = m[3] !== undefined ? Number(m[3]) : 0;
  const total = hours * HOUR_MS + minutes * MINUTE_MS + ms;
  return total > 0 ? total : null;
}

function parseTzOffset(text: string): number | null {
  const m = /^([+-])(\d{1,2}):(\d{2})$/.exec(text);
  if (m === null) return null;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  if (Number(m[3]) > 59 || minutes > 14 * 60) return null;
  return (m[1] === '-' ? -1 : 1) * minutes * MINUTE_MS;
}
