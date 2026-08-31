import type { Block } from '@worktree/core';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
/** Grid height per hour; a full day is 24 * this. */
export const DEFAULT_PX_PER_HOUR = 48;
/** Smallest clickable bar height, so tiny blocks stay reachable. */
export const MIN_BAR_PX = 14;
/** Left gutter holding the hour labels. */
export const HOUR_GUTTER_PX = 44;

/**
 * CSS `calc` for a position inside the grid's day area (i.e. excluding the
 * gutter). `fraction` is 0..1 of the day area, e.g. a day-column boundary at
 * i/n, or a bar's left edge at (dayIndex + lane/lanes)/n.
 */
export function dayOffsetCalc(fraction: number): string {
  return `calc(${HOUR_GUTTER_PX}px + ${fraction} * (100% - ${HOUR_GUTTER_PX}px))`;
}

/** CSS `calc` for a width inside the grid's day area, as a 0..1 fraction. */
export function dayWidthCalc(fraction: number): string {
  return `calc(${fraction} * (100% - ${HOUR_GUTTER_PX}px))`;
}

/** Local midnight of the day containing `ms` (DST-safe via Date constructor). */
export function dayStartMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isToday(dayStart: number, nowMs: number = Date.now()): boolean {
  return dayStartMs(nowMs) === dayStart;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** e.g. "Mon 9/1" — fixed English, independent of the browser locale. */
export function formatDayHeader(dayStart: number): string {
  const d = new Date(dayStart);
  return `${WEEKDAYS[d.getDay()]!} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** e.g. "09:00". */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** "YYYY-MM-DD" in local time, for the date input value. */
export function formatDateInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a "YYYY-MM-DD" date input as local midnight; null when malformed. */
export function parseDateInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m === null) return null;
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** One rendered bar segment: a block clipped to one day column. */
export interface LayoutBar {
  block: Block;
  id: string;
  /** The day column (0..dayCount-1) this segment is drawn in. */
  dayIndex: number;
  topPx: number;
  heightPx: number;
  /** Lane within the dayIndex column (overlapping bars sit side by side). */
  lane: number;
  lanes: number;
  startClipped: boolean;
  endClipped: boolean;
}

/**
 * Position every block on the grid canvas. `gridStart` is the local midnight
 * of the first visible day; each column is one day, 24h tall. Multi-day
 * blocks split into one segment per day column (22:00→next-day 02:00 shows
 * as 22:00–24:00 in day 1 and 0:00–02:00 in day 2); segments are clipped at
 * the grid edges. Overlapping segments within a day share the column side
 * by side (greedy lane assignment, longer first).
 */
export function layoutBlocks(
  blocks: Block[],
  gridStart: number,
  dayCount: number,
  pxPerHour: number = DEFAULT_PX_PER_HOUR,
): LayoutBar[] {
  const gridEnd = gridStart + dayCount * DAY_MS;
  const visible = blocks
    .map((block) => {
      const visStart = Math.max(block.start, gridStart);
      const visEnd = Math.min(block.end, gridEnd);
      if (visEnd <= visStart) return null;
      const dayIndex = Math.floor((visStart - gridStart) / DAY_MS);
      const endDayIdx = Math.floor((visEnd - 1 - gridStart) / DAY_MS);
      return {
        block,
        visStart,
        visEnd,
        dayIndex,
        endDayIdx,
        startClipped: block.start < gridStart,
        endClipped: block.end > gridEnd,
      };
    })
    .filter((b) => b !== null);

  // Greedy lanes per day: segments sorted by start asc, longer duration
  // first; each segment joins the first lane whose last segment has ended.
  const segmentsByDay = new Map<number, Array<{ blockId: string; start: number; end: number }>>();
  for (const v of visible) {
    for (let d = v.dayIndex; d <= v.endDayIdx; d++) {
      const dayStart = gridStart + d * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      const segs = segmentsByDay.get(d) ?? [];
      segs.push({ blockId: v.block.id, start: Math.max(v.visStart, dayStart), end: Math.min(v.visEnd, dayEnd) });
      segmentsByDay.set(d, segs);
    }
  }
  const laneOf = new Map<number, Map<string, number>>();
  const laneCount = new Map<number, number>();
  for (const [d, segs] of segmentsByDay) {
    const sorted = [...segs].sort(
      (a, b) => a.start - b.start || b.end - a.end || (a.blockId < b.blockId ? -1 : 1),
    );
    const laneEnds: number[] = [];
    const assigned = new Map<string, number>();
    for (const seg of sorted) {
      let lane = laneEnds.findIndex((end) => end <= seg.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(seg.end);
      } else {
        laneEnds[lane] = seg.end;
      }
      assigned.set(seg.blockId, lane);
    }
    laneOf.set(d, assigned);
    laneCount.set(d, laneEnds.length);
  }

  const bars: LayoutBar[] = [];
  for (const v of visible) {
    for (let d = v.dayIndex; d <= v.endDayIdx; d++) {
      const dayStart = gridStart + d * DAY_MS;
      const dayEnd = dayStart + DAY_MS;
      const segStart = Math.max(v.visStart, dayStart);
      const segEnd = Math.min(v.visEnd, dayEnd);
      bars.push({
        block: v.block,
        id: v.block.id,
        dayIndex: d,
        topPx: ((segStart - dayStart) / HOUR_MS) * pxPerHour,
        heightPx: Math.max(MIN_BAR_PX, ((segEnd - segStart) / HOUR_MS) * pxPerHour),
        lane: laneOf.get(d)!.get(v.block.id)!,
        lanes: laneCount.get(d)!,
        startClipped: v.startClipped,
        endClipped: v.endClipped,
      });
    }
  }
  return bars;
}
