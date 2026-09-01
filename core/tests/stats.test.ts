import { describe, expect, it } from 'vitest';
import type { Operation } from '../src/types';
import { computeStats } from '../src/stats';
import { WorktreeState } from '../src/state';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

/** Replay ops and compute stats over the derived state. */
function stats(ops: Operation[], now: number = NOW) {
  const state = WorktreeState.fromOps(ops);
  return computeStats(state.tree.getRoot(), state.calendar.getBlocks(), now);
}

const add = (id: string, name = id, extra: Record<string, unknown> = {}): Operation => ({
  kind: 'add',
  parentId: 'root',
  id,
  name,
  weight: 1,
  ...extra,
});

describe('computeStats', () => {
  it('returns zeroed stats for an empty tree', () => {
    const s = stats([]);
    expect(s.nodes).toEqual({ total: 0, completed: 0, incomplete: 0, completionRatio: null });
    expect(s.reminders).toEqual({ total: 0, active: 0, missed: 0 });
    expect(s.blocks).toEqual({ total: 0, completed: 0, completionRatio: null, linked: 0, upcoming7dHours: 0 });
    expect(s.timing).toEqual({
      completionBufferRatio: null,
      blockBufferRatio: null,
      overdueIncomplete: 0,
      lateCompletionRatio: null,
      completed7d: 0,
      completed30d: 0,
      avgIncompleteAgeDays: null,
      oldestIncompleteDays: null,
    });
  });

  it('counts nodes and their completion ratio', () => {
    const s = stats([
      add('a', 'a', { timestamp: NOW - 10 * DAY }),
      add('b', 'b', { timestamp: NOW - 10 * DAY }),
      { kind: 'complete', id: 'b', timestamp: NOW - 5 * DAY },
    ]);
    expect(s.nodes).toEqual({ total: 2, completed: 1, incomplete: 1, completionRatio: 0.5 });
  });

  it('counts total, active and missed reminders', () => {
    const s = stats([
      add('a', 'a', { timestamp: NOW - DAY }),
      add('b', 'b', { timestamp: NOW - DAY }),
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r1', deadline: NOW - DAY }, // active, due, node open -> missed
      { kind: 'add_reminder', nodeId: 'a', rmdId: 'r2', deadline: NOW + DAY }, // active, future -> not missed
      { kind: 'add_reminder', nodeId: 'b', rmdId: 'r3', deadline: NOW - DAY },
      { kind: 'edit_reminder', rmdId: 'r3', active: false }, // inactive, due -> not missed
      { kind: 'add_reminder', nodeId: 'b', rmdId: 'r4', deadline: NOW - DAY },
      { kind: 'complete', id: 'b', timestamp: NOW - 2 * DAY }, // completed node -> not missed
    ]);
    expect(s.reminders).toEqual({ total: 4, active: 3, missed: 1 });
  });

  it('counts blocks, their completion and link status', () => {
    const s = stats([
      add('n', 'n', { timestamp: NOW - DAY }),
      { kind: 'add_block', id: 'b1', name: 'B1', start: NOW - 2 * DAY, end: NOW - DAY }, // past
      { kind: 'add_block', id: 'b2', name: 'B2', start: NOW - DAY, end: NOW + 2 * DAY, nodeId: 'n' }, // 2d overlap
      { kind: 'add_block', id: 'b3', name: 'B3', start: NOW + 3 * DAY, end: NOW + 5 * DAY }, // 2d overlap
      { kind: 'add_block', id: 'b4', name: 'B4', start: NOW + 8 * DAY, end: NOW + 9 * DAY }, // beyond window
      { kind: 'complete_block', id: 'b1', timestamp: NOW - DAY },
      { kind: 'complete_block', id: 'b2', timestamp: NOW },
    ]);
    expect(s.blocks).toEqual({
      total: 4,
      completed: 2,
      completionRatio: 0.5,
      linked: 1,
      upcoming7dHours: 4 * 24, // b2 (2d) + b3 (2d)
    });
  });

  it('averages the completion buffer ratio over completed deadline nodes', () => {
    const s = stats([
      // buffer 0.5: 10d of the 20d window left at completion
      add('a', 'a', { timestamp: NOW - 10 * DAY, deadline: NOW + 10 * DAY }),
      { kind: 'complete', id: 'a', timestamp: NOW },
      // buffer -0.5: finished 5d after a deadline 10d out from creation
      add('b', 'b', { timestamp: NOW - 20 * DAY, deadline: NOW - 10 * DAY }),
      { kind: 'complete', id: 'b', timestamp: NOW - 5 * DAY },
      // completed by a legacy op: completedAt 0 -> excluded
      add('c', 'c', { timestamp: NOW - 20 * DAY, deadline: NOW + 10 * DAY }),
      { kind: 'complete', id: 'c' },
      // completed but no deadline -> excluded
      add('d', 'd', { timestamp: NOW - 20 * DAY }),
      { kind: 'complete', id: 'd', timestamp: NOW },
      // deadline not after createdAt -> excluded
      add('e', 'e', { timestamp: NOW, deadline: NOW - DAY }),
      { kind: 'complete', id: 'e', timestamp: NOW + DAY },
    ]);
    expect(s.timing.completionBufferRatio).toBeCloseTo(0);
    expect(s.timing.lateCompletionRatio).toBeCloseTo(0.5); // b late, a on time
    expect(s.timing.completed7d).toBe(4); // a, b, d, e
    expect(s.timing.completed30d).toBe(4);
  });

  it('computes the late completion ratio over completed deadline nodes', () => {
    const s = stats([
      add('a', 'a', { timestamp: NOW - 20 * DAY, deadline: NOW - 10 * DAY }),
      { kind: 'complete', id: 'a', timestamp: NOW - 5 * DAY }, // late
      add('b', 'b', { timestamp: NOW - 20 * DAY, deadline: NOW - 10 * DAY }),
      { kind: 'complete', id: 'b', timestamp: NOW - 15 * DAY }, // on time
      add('c', 'c', { timestamp: NOW - 20 * DAY, deadline: NOW - 10 * DAY }),
      { kind: 'complete', id: 'c', timestamp: NOW - 8 * DAY }, // late
    ]);
    expect(s.timing.lateCompletionRatio).toBeCloseTo(2 / 3);
  });

  it('averages the block buffer ratio over nodes linked to a block', () => {
    const s = stats([
      // buffer 1/3: block ends 10d before a deadline 30d out from creation
      add('a', 'a', { timestamp: NOW - 20 * DAY, deadline: NOW + 10 * DAY }),
      { kind: 'add_block', id: 'b1', name: 'B1', start: NOW - DAY, end: NOW, nodeId: 'a' },
      // buffer -1/3: block planned past the deadline
      add('c', 'c', { timestamp: NOW - 20 * DAY, deadline: NOW + 10 * DAY }),
      { kind: 'add_block', id: 'b2', name: 'B2', start: NOW + DAY, end: NOW + 20 * DAY, nodeId: 'c' },
      // linked block but no deadline -> excluded
      add('d', 'd', { timestamp: NOW - 20 * DAY }),
      { kind: 'add_block', id: 'b3', name: 'B3', start: NOW, end: NOW + DAY, nodeId: 'd' },
      // block without a link -> ignored
      add('e', 'e', { timestamp: NOW - 20 * DAY, deadline: NOW + 10 * DAY }),
      { kind: 'add_block', id: 'b4', name: 'B4', start: NOW, end: NOW + DAY },
    ]);
    expect(s.timing.blockBufferRatio).toBeCloseTo(0);
  });

  it('counts overdue incomplete nodes but not completed ones', () => {
    const s = stats([
      add('a', 'a', { timestamp: NOW - 20 * DAY, deadline: NOW - DAY }),
      add('b', 'b', { timestamp: NOW - 20 * DAY, deadline: NOW - DAY }),
      { kind: 'complete', id: 'b', timestamp: NOW - 2 * DAY }, // completed, past deadline -> not counted
      add('c', 'c', { timestamp: NOW - 20 * DAY, deadline: NOW + DAY }), // future deadline -> not counted
    ]);
    expect(s.timing.overdueIncomplete).toBe(1);
  });

  it('counts completions within 7/30-day windows with exclusive lower bound', () => {
    const s = stats([
      add('a', 'a', { timestamp: NOW - 40 * DAY }),
      { kind: 'complete', id: 'a', timestamp: NOW - 7 * DAY }, // exactly 7d -> not in 7d, in 30d
      add('b', 'b', { timestamp: NOW - 40 * DAY }),
      { kind: 'complete', id: 'b', timestamp: NOW - 7 * DAY + 1 }, // within 7d
      add('c', 'c', { timestamp: NOW - 40 * DAY }),
      { kind: 'complete', id: 'c', timestamp: NOW - 30 * DAY }, // exactly 30d -> not in 30d
      add('d', 'd', { timestamp: NOW - 40 * DAY }),
      { kind: 'complete', id: 'd', timestamp: NOW - 30 * DAY + 1 }, // within 30d
    ]);
    expect(s.timing.completed7d).toBe(1);
    expect(s.timing.completed30d).toBe(3);
  });

  it('averages the age of incomplete nodes and finds the oldest', () => {
    const s = stats([
      add('a', 'a', { timestamp: NOW - 2 * DAY }),
      add('b', 'b', { timestamp: NOW - 4 * DAY }),
      add('c', 'c'), // legacy: createdAt 0 -> excluded from ages
      add('d', 'd', { timestamp: NOW - 3 * DAY }),
      { kind: 'complete', id: 'd', timestamp: NOW - DAY }, // completed -> excluded
    ]);
    expect(s.timing.avgIncompleteAgeDays).toBeCloseTo(3);
    expect(s.timing.oldestIncompleteDays).toBeCloseTo(4);
  });

  it('completion via a linked block records the block op timestamp', () => {
    const s = stats([
      add('n', 'n', { timestamp: NOW - 10 * DAY, deadline: NOW + 10 * DAY }),
      { kind: 'add_block', id: 'b1', name: 'B1', start: NOW - DAY, end: NOW, nodeId: 'n' },
      { kind: 'complete_block', id: 'b1', timestamp: NOW - 2 * DAY },
    ]);
    expect(s.nodes.completed).toBe(1);
    // buffer = (deadline - completedAt) / (deadline - createdAt) = 12d / 20d
    expect(s.timing.completionBufferRatio).toBeCloseTo(0.6);
  });
});
