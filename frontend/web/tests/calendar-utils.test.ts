import { describe, expect, it } from 'vitest';
import type { Block } from '@worktree/core';
import {
  DEFAULT_PX_PER_HOUR,
  HOUR_GUTTER_PX,
  MIN_BAR_PX,
  dayOffsetCalc,
  dayStartMs,
  dayWidthCalc,
  formatDateInput,
  formatDayHeader,
  formatHourLabel,
  isToday,
  layoutBlocks,
  parseDateInput,
} from '../src/calendar-utils';

// DST-free local reference dates: Jan 15-18, 2026.
const jan = (day: number, hour = 0, minute = 0): number => new Date(2026, 0, day, hour, minute).getTime();
const gridStart = jan(15);
const blk = (id: string, start: number, end: number): Block => ({
  id,
  name: id,
  start,
  end,
  note: '',
  status: false,
});

describe('dayStartMs / isToday', () => {
  it('returns local midnight', () => {
    expect(dayStartMs(jan(15, 13, 45))).toBe(jan(15));
  });

  it('isToday compares day starts', () => {
    expect(isToday(jan(15), jan(15, 23, 59))).toBe(true);
    expect(isToday(jan(15), jan(16))).toBe(false);
  });
});

describe('grid calc helpers', () => {
  it('positions offsets and widths as fractions of the day area', () => {
    expect(dayOffsetCalc(1 / 3)).toBe(`calc(${HOUR_GUTTER_PX}px + ${1 / 3} * (100% - ${HOUR_GUTTER_PX}px))`);
    expect(dayWidthCalc(1 / 3)).toBe(`calc(${1 / 3} * (100% - ${HOUR_GUTTER_PX}px))`);
  });
});

describe('date input helpers', () => {
  it('formats and parses local dates round-trip', () => {
    const ms = jan(15, 13, 45);
    expect(formatDateInput(ms)).toBe('2026-01-15');
    expect(parseDateInput('2026-01-15')).toBe(jan(15));
    expect(parseDateInput('')).toBeNull();
    expect(parseDateInput('not-a-date')).toBeNull();
  });
});

describe('formatDayHeader / formatHourLabel', () => {
  it('formats "Weekday m/d"', () => {
    // Jan 15 2026 is a Thursday.
    expect(formatDayHeader(jan(15))).toBe('Thu 1/15');
  });

  it('formats zero-padded hours', () => {
    expect(formatHourLabel(0)).toBe('00:00');
    expect(formatHourLabel(9)).toBe('09:00');
    expect(formatHourLabel(23)).toBe('23:00');
  });
});

describe('layoutBlocks', () => {
  it('positions a same-day block by its start and duration', () => {
    const bars = layoutBlocks([blk('b', jan(15, 9), jan(15, 10, 30))], gridStart, 7);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      dayIndex: 0,
      topPx: 9 * DEFAULT_PX_PER_HOUR,
      heightPx: 1.5 * DEFAULT_PX_PER_HOUR,
      startClipped: false,
      endClipped: false,
    });
  });

  it('splits a midnight-crossing block into per-day segments', () => {
    const bars = layoutBlocks([blk('b', jan(15, 22), jan(16, 2))], gridStart, 7);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ dayIndex: 0, topPx: 22 * DEFAULT_PX_PER_HOUR, heightPx: 2 * DEFAULT_PX_PER_HOUR });
    expect(bars[1]).toMatchObject({ dayIndex: 1, topPx: 0, heightPx: 2 * DEFAULT_PX_PER_HOUR });
  });

  it('a block ending exactly at midnight belongs to the prior day only', () => {
    const bars = layoutBlocks([blk('b', jan(15, 9), jan(16, 0))], gridStart, 7);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ dayIndex: 0 });
  });

  it('clips blocks that start before the grid', () => {
    const bars = layoutBlocks([blk('b', jan(14, 23), jan(15, 10))], gridStart, 7);
    expect(bars[0]).toMatchObject({ dayIndex: 0, topPx: 0, startClipped: true });
  });

  it('clips blocks that end after the grid', () => {
    // Visible portion: Jan 15 23:00 → Jan 18 00:00, one segment per day.
    const bars = layoutBlocks([blk('b', jan(15, 23), jan(18, 5))], gridStart, 3);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toMatchObject({ dayIndex: 0, topPx: 23 * DEFAULT_PX_PER_HOUR, heightPx: DEFAULT_PX_PER_HOUR });
    expect(bars[1]).toMatchObject({ dayIndex: 1, topPx: 0, heightPx: 24 * DEFAULT_PX_PER_HOUR });
    expect(bars[2]).toMatchObject({ dayIndex: 2, topPx: 0, heightPx: 24 * DEFAULT_PX_PER_HOUR });
    expect(bars.every((b) => b.endClipped)).toBe(true);
  });

  it('omits blocks fully outside the grid', () => {
    const bars = layoutBlocks([blk('b', jan(18, 10), jan(18, 12))], gridStart, 3);
    expect(bars).toHaveLength(0);
  });

  it('gives short blocks a minimum clickable height', () => {
    const bars = layoutBlocks([blk('b', jan(15, 9), jan(15, 9, 5))], gridStart, 7);
    expect(bars[0]!.heightPx).toBe(MIN_BAR_PX);
  });

  it('splits overlapping blocks into side-by-side lanes', () => {
    const bars = layoutBlocks(
      [blk('B', jan(15, 10), jan(15, 12)), blk('A', jan(15, 9), jan(15, 11))],
      gridStart,
      7,
    );
    const byId = Object.fromEntries(bars.map((b) => [b.id, b]));
    expect(byId['A']!.lane).toBe(0);
    expect(byId['B']!.lane).toBe(1);
    expect(byId['A']!.lanes).toBe(2);
  });

  it('keeps sequential blocks in the same lane', () => {
    const bars = layoutBlocks(
      [blk('A', jan(15, 9), jan(15, 10)), blk('B', jan(15, 10), jan(15, 11))],
      gridStart,
      7,
    );
    expect(bars[0]!.lane).toBe(0);
    expect(bars[1]!.lane).toBe(0);
  });

  it('assigns lanes independently per day', () => {
    const bars = layoutBlocks(
      [
        blk('A', jan(15, 9), jan(15, 10)),
        blk('B', jan(15, 9, 30), jan(15, 10, 30)), // overlaps A on day 0
        blk('C', jan(16, 9), jan(16, 10)), // alone on day 1
      ],
      gridStart,
      7,
    );
    const byId = Object.fromEntries(bars.map((b) => [b.id, b]));
    expect(byId['A']!.lanes).toBe(2);
    expect(byId['B']!.lanes).toBe(2);
    expect(byId['C']!.lanes).toBe(1);
  });
});
