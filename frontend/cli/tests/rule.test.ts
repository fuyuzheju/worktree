import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ID, daysFromCivil, endOfCivilDay } from '@worktree/core';
import { WorktreeClient } from '@worktree/client';
import { COMMANDS } from '../src/commands';
import { createCommandIO, createDispatcher } from '../src/command';
import type { CommandIO } from '../src/command';
import { parseRuleFields } from '../src/rules';

const newIO = () => {
  const lines: string[] = [];
  const ctx = {
    client: new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'local', local: true }),
    out: (line: string | undefined) => lines.push(line ?? ''),
    cwdId: ROOT_ID,
    currentUser: 'local',
    filter: {},
    filterMode: 'hide' as const,
  };
  const io = createCommandIO(ctx);
  return { ctx, io, lines };
};

const run = async (io: CommandIO, line: string) =>
  createDispatcher(COMMANDS)(io, line.split(/\s+/)[0]!, line.split(/\s+/).slice(1));

/** Parser call with the add defaults; `tzOffset` is the device's in the CLI. */
const parse = (args: string[], mode: 'add' | 'edit' = 'add', freq?: 'daily' | 'weekly' | 'monthly' | 'yearly') =>
  parseRuleFields(args, { mode, freq, tzOffset: 0 });

const fieldsOf = (result: ReturnType<typeof parse>) => {
  if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
  return result.fields;
};

const errorOf = (result: ReturnType<typeof parse>) => {
  if (result.ok) throw new Error('expected a parse error');
  return result.error;
};

describe('parseRuleFields', () => {
  it('reads plain weekdays for a weekly rule', () => {
    const fields = fieldsOf(parse(['freq=weekly', 'day=mon,wed']));
    expect(fields).toEqual({
      freq: 'weekly',
      byDay: [1, 3],
      byMonthDay: undefined,
      byMonth: undefined,
      bySetPos: undefined,
    });
  });

  it('reads nth weekdays for a monthly rule', () => {
    expect(fieldsOf(parse(['freq=monthly', 'day=2nd-tue']))).toMatchObject({ byDay: [2], bySetPos: 2 });
    expect(fieldsOf(parse(['freq=monthly', 'day=last-fri']))).toMatchObject({ byDay: [5], bySetPos: -1 });
    expect(fieldsOf(parse(['freq=monthly', 'day=2nd-tue,2nd-thu']))).toMatchObject({ byDay: [2, 4], bySetPos: 2 });
  });

  it('reads month days, including last', () => {
    expect(fieldsOf(parse(['freq=monthly', 'mday=15,last']))).toMatchObject({ byMonthDay: [15, -1] });
    expect(fieldsOf(parse(['freq=yearly', 'month=3', 'mday=15']))).toMatchObject({
      byMonth: [3],
      byMonthDay: [15],
    });
  });

  it('rejects selectors the frequency does not take', () => {
    expect(errorOf(parse(['freq=daily', 'day=mon']))).toMatch(/daily rules take no/);
    expect(errorOf(parse(['freq=weekly', 'mday=15']))).toMatch(/mday= is not valid here/);
    expect(errorOf(parse(['freq=weekly', 'day=2nd-tue']))).toMatch(/plain weekdays/);
    expect(errorOf(parse(['freq=monthly', 'month=3']))).toMatch(/month= is not valid here/);
    expect(errorOf(parse(['freq=monthly', 'day=mon', 'mday=15']))).toMatch(/not both/);
    expect(errorOf(parse(['freq=yearly', 'day=mon']))).toMatch(/day= is not valid here/);
  });

  it('rejects malformed selector values', () => {
    expect(errorOf(parse(['freq=weekly', 'day=funday']))).toMatch(/invalid weekday/);
    expect(errorOf(parse(['freq=weekly', 'day=mon,mon']))).toMatch(/duplicate weekday/);
    expect(errorOf(parse(['freq=monthly', 'day=mon,2nd-tue']))).toMatch(/cannot mix/);
    expect(errorOf(parse(['freq=monthly', 'day=2nd-tue,last-fri']))).toMatch(/share one position/);
    expect(errorOf(parse(['freq=weekly', 'day=6th-mon']))).toMatch(/invalid nth weekday/);
    expect(errorOf(parse(['freq=monthly', 'mday=32']))).toMatch(/invalid month day/);
    expect(errorOf(parse(['freq=monthly', 'mday=0']))).toMatch(/invalid month day/);
    expect(errorOf(parse(['freq=yearly', 'month=13']))).toMatch(/invalid month/);
  });

  it('parses times, durations and dates', () => {
    expect(parse(['freq=daily', 'time=9:05']).ok && fieldsOf(parse(['freq=daily', 'time=9:05'])).timeOfDay).toEqual({
      hour: 9,
      minute: 5,
    });
    expect(parse(['freq=daily', 'time=25:00']).ok).toBe(false);
    expect(fieldsOf(parse(['freq=daily', 'dur=90m'])).duration).toBe(90 * 60_000);
    expect(fieldsOf(parse(['freq=daily', 'dur=2h'])).duration).toBe(2 * 3_600_000);
    expect(fieldsOf(parse(['freq=daily', 'dur=1h30m'])).duration).toBe(90 * 60_000);
    expect(fieldsOf(parse(['freq=daily', 'dur=5400000ms'])).duration).toBe(5_400_000);
    expect(errorOf(parse(['freq=daily', 'dur=90']))).toMatch(/invalid duration/);
    expect(errorOf(parse(['freq=daily', 'dur=0m']))).toMatch(/invalid duration/);
    expect(fieldsOf(parse(['freq=daily', 'from=2026-09-23'])).startDate).toEqual({
      year: 2026,
      month: 9,
      day: 23,
    });
    expect(errorOf(parse(['freq=daily', 'from=2026-02-30']))).toMatch(/invalid date/);
    expect(errorOf(parse(['freq=daily', 'interval=0']))).toMatch(/invalid interval/);
  });

  it('resolves until to the end of that civil day in the rule offset', () => {
    const day = daysFromCivil(2026, 12, 31);
    expect(fieldsOf(parse(['freq=daily', 'until=2026-12-31'])).until).toBe(endOfCivilDay(day, 0));
    const shifted = fieldsOf(parse(['freq=daily', 'until=2026-12-31', 'tz=+08:00']));
    expect(shifted.tzOffset).toBe(8 * 3_600_000);
    expect(shifted.until).toBe(endOfCivilDay(day, 8 * 3_600_000));
    expect(parse(['freq=daily', 'until=null']).ok).toBe(false);
    expect(fieldsOf(parse(['until=null'], 'edit', 'weekly')).until).toBeNull();
  });

  it('takes a fixed offset on add only', () => {
    expect(fieldsOf(parse(['freq=daily', 'tz=-05:30'])).tzOffset).toBe(-5.5 * 3_600_000);
    expect(errorOf(parse(['freq=daily', 'tz=+8']))).toMatch(/invalid tz/);
    expect(errorOf(parse(['freq=daily', 'tz=+15:00']))).toMatch(/invalid tz/);
    expect(errorOf(parse(['tz=+08:00'], 'edit', 'weekly'))).toMatch(/cannot be changed/);
  });

  it('scopes edit patches by the rule frequency', () => {
    // Nothing supplied stays out of the patch, so an untouched selector survives.
    expect(fieldsOf(parse(['name=x'], 'edit', 'weekly'))).toEqual({ name: 'x' });
    expect(fieldsOf(parse(['freq=weekly'], 'edit', 'monthly'))).toEqual({ freq: 'weekly' });
    // Switching selector mode clears the other one (null, not undefined).
    expect(fieldsOf(parse(['mday=15'], 'edit', 'monthly'))).toMatchObject({
      byMonthDay: [15],
      byDay: null,
      bySetPos: null,
    });
    expect(fieldsOf(parse(['day=mon'], 'edit', 'monthly'))).toMatchObject({
      byDay: [1],
      byMonthDay: null,
      bySetPos: null,
    });
    expect(fieldsOf(parse(['day=last-fri'], 'edit', 'monthly'))).toMatchObject({ byDay: [5], bySetPos: -1 });
    expect(fieldsOf(parse(['month=3'], 'edit', 'yearly'))).toMatchObject({ byMonth: [3], byDay: null });
  });

  it('requires a frequency and rejects unknown fields', () => {
    expect(errorOf(parse(['day=mon']))).toMatch(/freq is required/);
    expect(errorOf(parse(['freq=sometimes']))).toMatch(/invalid freq/);
    expect(errorOf(parse(['freq=daily', 'color=blue']))).toMatch(/unknown field: color/);
    expect(errorOf(parse(['freq=daily', 'day']))).toMatch(/invalid key=value/);
    expect(errorOf(parse(['freq=daily', 'active=false']))).toMatch(/only makes sense when editing/);
    expect(fieldsOf(parse(['active=false'], 'edit', 'daily')).active).toBe(false);
    expect(errorOf(parse(['active=maybe'], 'edit', 'daily'))).toMatch(/invalid active/);
  });
});

describe('rule command', () => {
  const seeded = async () => {
    const { io, ctx, lines } = newIO();
    await run(io, 'rule add standup freq=weekly day=wed from=2026-09-23 time=10:00 dur=2h');
    return { io, ctx, lines };
  };

  it('rule add creates the rule from the parsed fields and reports its short id', async () => {
    const { ctx, lines } = await seeded();
    expect(lines).toEqual([expect.stringMatching(/^added rule \[.{4}\] standup$/)]);
    expect(ctx.client.getRules()[0]).toMatchObject({
      name: 'standup',
      freq: 'weekly',
      interval: 1,
      startDate: { year: 2026, month: 9, day: 23 },
      timeOfDay: { hour: 10, minute: 0 },
      duration: 2 * 3_600_000,
      byDay: [3],
      active: true,
    });
  });

  it('rule add defaults the anchor to today and the time to 09:00', async () => {
    const { io, ctx } = await newIO();
    await run(io, 'rule add daily-things freq=daily');
    const today = new Date();
    expect(ctx.client.getRules()[0]).toMatchObject({
      startDate: { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() },
      timeOfDay: { hour: 9, minute: 0 },
      duration: 3_600_000,
    });
  });

  it('rule add rejects a bad field before touching the client', async () => {
    const { io, ctx, lines } = await newIO();
    await run(io, 'rule add bad freq=monthly day=2nd-tue mday=1');
    expect(lines[0]).toMatch(/not both/);
    expect(ctx.client.getRules()).toHaveLength(0);
  });

  it('rule ls prints the schedule and the exception days', async () => {
    const { io, ctx, lines } = await seeded();
    await run(io, 'rule skip standup 2026-09-30');
    lines.length = 0;
    await run(io, 'rule ls');
    expect(lines[0]).toMatch(/^standup \[.{4}\] weekly on Wed at 10:00 2h from 2026-09-23$/);
    expect(lines[1]).toBe('  skipped: 2026-09-30');
    expect(ctx.client.getSkips(ctx.client.getRules()[0]!.id)).toEqual([daysFromCivil(2026, 9, 30)]);
  });

  it('rule edit patches single fields and keeps the skips a day-keyed tweak cannot orphan', async () => {
    const { io, ctx, lines } = await seeded();
    await run(io, 'rule skip standup 2026-09-30');
    const id = ctx.client.getRules()[0]!.id;
    await run(io, 'rule edit standup time=11:00');
    expect(ctx.client.getRules()[0]?.timeOfDay).toEqual({ hour: 11, minute: 0 });
    expect(ctx.client.getSkips(id)).toEqual([daysFromCivil(2026, 9, 30)]);
    // A day-set edit does clear them (they may no longer be occurrences).
    await run(io, 'rule edit standup day=thu');
    expect(ctx.client.getRules()[0]?.byDay).toEqual([4]);
    expect(ctx.client.getSkips(id)).toEqual([]);
    lines.length = 0;
    await run(io, 'rule edit standup');
    expect(lines).toEqual(['empty patch']);
    await run(io, 'rule edit standup nope=1');
    expect(lines).toContain('unknown field: nope');
  });

  it('rule rm removes the rule and its exceptions', async () => {
    const { io, ctx } = await seeded();
    await run(io, 'rule skip standup 2026-09-30');
    await run(io, 'rule rm standup');
    expect(ctx.client.getRules()).toHaveLength(0);
  });

  it('rule skip cancels one occurrence and rule unskip restores it', async () => {
    const { io, ctx, lines } = await seeded();
    const id = ctx.client.getRules()[0]!.id;
    const from = new Date(2026, 8, 28).getTime();
    const to = new Date(2026, 9, 5).getTime();
    expect(ctx.client.expandOccurrences(from, to).map((o) => o.day)).toEqual([daysFromCivil(2026, 9, 30)]);

    await run(io, 'rule skip standup 2026-09-30');
    expect(lines.at(-1)).toBe('skipped "standup" on 2026-09-30');
    expect(ctx.client.getSkips(id)).toEqual([daysFromCivil(2026, 9, 30)]);
    expect(ctx.client.expandOccurrences(from, to)).toHaveLength(0);

    await run(io, 'rule skip standup 2026-09-30');
    expect(lines.at(-1)).toBe('"standup" is already skipped on 2026-09-30');
    await run(io, 'rule unskip standup 2026-09-30');
    expect(lines.at(-1)).toBe('restored "standup" on 2026-09-30');
    expect(ctx.client.expandOccurrences(from, to)).toHaveLength(1);
    await run(io, 'rule unskip standup 2026-09-30');
    expect(lines.at(-1)).toBe('"standup" is not skipped on 2026-09-30');
  });

  it('rule skip rejects a date the rule has no occurrence on', async () => {
    const { io, ctx, lines } = await seeded();
    await run(io, 'rule skip standup 2026-10-01');
    expect(lines.at(-1)).toBe('"standup" has no occurrence on 2026-10-01');
    await run(io, 'rule skip standup 2026-09-01');
    expect(lines.at(-1)).toBe('"standup" has no occurrence on 2026-09-01');
    await run(io, 'rule skip standup 2026-09-3');
    expect(lines.at(-1)).toBe('invalid date: 2026-09-3 (use YYYY-MM-DD)');
    expect(ctx.client.getSkips(ctx.client.getRules()[0]!.id)).toEqual([]);
  });

  it('rule refs resolve by unique name or unique id prefix', async () => {
    const { io, ctx } = await seeded();
    const id = ctx.client.getRules()[0]?.id ?? '';
    await run(io, `rule rm ${id.slice(0, 6)}`);
    expect(ctx.client.getRules()).toHaveLength(0);
    await run(io, 'rule rm standup');
    expect(ctx.client.getRules()).toHaveLength(0);
  });
});

describe('cld with rule occurrences', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows derived occurrences with a repeat marker and drops skipped days', async () => {
    const { io, lines } = newIO();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T12:00:00'));
    await run(io, 'rule add standup freq=weekly day=tue from=2026-09-01 time=10:00 dur=1h');
    lines.length = 0;
    await run(io, 'cld 14');
    const out = lines.join('\n');
    expect(out).toContain('2026-09-01 Tue *\n  ↻ standup');
    expect(out).toContain('2026-09-08 Tue\n  ↻ standup');
    expect(out).toContain('10:00–11:00');
    expect(out).not.toContain('2026-09-15');

    await run(io, 'rule skip standup 2026-09-08');
    lines.length = 0;
    await run(io, 'cld 14');
    const after = lines.join('\n');
    expect(after).toContain('2026-09-01 Tue *\n  ↻ standup');
    expect(after).toContain('2026-09-08 Tue\n2026-09-09');
  });
});
