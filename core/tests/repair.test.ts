import { describe, expect, it } from 'vitest';
import { HistoryReplayError, ROOT_ID, daysFromCivil, planDropRepair, replayHistory } from '../src/index';
import type { HistoryNode, Operation } from '../src/index';

const entry = (id: string, op: Operation): HistoryNode => ({ id, op });
const add = (id: string, parentId = ROOT_ID): Operation => ({ kind: 'add', parentId, id, name: id, weight: 1 });

describe('replayHistory', () => {
  it('derives the state of a valid history', () => {
    const state = replayHistory([entry('h1', add('a')), entry('h2', add('b', 'a'))]);
    expect(state.tree.getNode('b')?.name).toBe('b');
  });

  it('identifies the entry that fails replay', () => {
    const nodes = [
      entry('h1', add('a')),
      entry('h2', add('b', 'a')),
      entry('h3', { kind: 'complete', id: 'a' }),
    ];
    let caught: unknown;
    try {
      replayHistory(nodes);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HistoryReplayError);
    if (!(caught instanceof HistoryReplayError)) return;
    expect(caught.entryId).toBe('h3');
    expect(caught.index).toBe(2);
    expect(caught.message).toContain('child "b" is not completed');
    expect(caught.op).toEqual({ kind: 'complete', id: 'a' });
  });
});

describe('planDropRepair', () => {
  it('leaves a clean history untouched', () => {
    const nodes = [entry('h1', add('a')), entry('h2', add('b', 'a')), entry('h3', { kind: 'complete', id: 'b' })];
    const plan = planDropRepair(nodes);
    expect(plan.dropped).toEqual([]);
    expect(plan.repaired).toEqual(nodes);
  });

  it('drops only the entries that fail, keeping later valid ones', () => {
    const nodes = [
      entry('h1', add('a')),
      entry('h2', add('b', 'a')),
      entry('h3', { kind: 'complete', id: 'a' }), // legacy: child b not completed
      entry('h4', { kind: 'complete', id: 'b' }),
      entry('h5', { kind: 'complete', id: 'a' }),
    ];
    const plan = planDropRepair(nodes);
    expect(plan.dropped.map((d) => d.entry.id)).toEqual(['h3']);
    expect(plan.dropped[0].description).toBe('complete "a"');
    expect(plan.dropped[0].reason).toContain('child "b" is not completed');
    expect(plan.repaired.map((n) => n.id)).toEqual(['h1', 'h2', 'h4', 'h5']);
    const state = replayHistory(plan.repaired);
    expect(state.tree.getNode('a')?.status).toBe(true);
  });

  it('reports entries that fail because an earlier drop removed their target', () => {
    const nodes = [
      entry('h1', add('a')),
      entry('h2', { kind: 'add', parentId: ROOT_ID, id: 'x', name: 'a', weight: 1 }), // duplicate sibling name, dropped
      entry('h3', { kind: 'complete', id: 'x' }), // unknown node: h2 was dropped
    ];
    const plan = planDropRepair(nodes);
    expect(plan.dropped.map((d) => d.entry.id)).toEqual(['h2', 'h3']);
    expect(plan.dropped[1].reason).toContain('unknown node id: x');
    expect(plan.repaired.map((n) => n.id)).toEqual(['h1']);
  });

  it('describes rule and exception ops', () => {
    const day = daysFromCivil(2026, 9, 23);
    const nodes = [
      entry('h1', add('a')),
      entry('h2', { kind: 'add_block_rule', id: 'r1', name: 'standup', freq: 'weekly', interval: 1, startDate: { year: 2026, month: 9, day: 23 }, timeOfDay: { hour: 10, minute: 0 }, duration: 3600000, tzOffset: 0 }),
      entry('h3', { kind: 'skip_occurrence', ruleId: 'r1', day }),
      entry('h4', { kind: 'skip_occurrence', ruleId: 'r1', day: daysFromCivil(2026, 9, 24) }), // not an occurrence
      entry('h5', { kind: 'remove_block_rule', id: 'r1' }),
      entry('h6', { kind: 'edit_block_rule', id: 'missing', name: 'x' }), // unknown rule
    ];
    const plan = planDropRepair(nodes);
    expect(plan.dropped.map((d) => d.description)).toEqual([
      'skip_occurrence "standup" 2026-09-24',
      'edit_block_rule missing',
    ]);
    expect(plan.repaired.map((n) => n.id)).toEqual(['h1', 'h2', 'h3', 'h5']);
  });

  it('reports skips stranded by a dropped rule add', () => {
    const day = daysFromCivil(2026, 9, 23);
    const nodes = [
      entry('h1', add('a')),
      entry('h2', { kind: 'add_block_rule', id: 'r1', name: 'standup', freq: 'daily', interval: 1, startDate: { year: 2026, month: 9, day: 23 }, timeOfDay: { hour: 10, minute: 0 }, duration: 3600000, byDay: [3], tzOffset: 0 }), // daily rules take no selectors
      entry('h3', { kind: 'skip_occurrence', ruleId: 'r1', day }), // its rule was dropped
    ];
    const plan = planDropRepair(nodes);
    expect(plan.dropped.map((d) => d.entry.id)).toEqual(['h2', 'h3']);
    expect(plan.dropped[0].reason).toContain('daily rules take no selectors');
    expect(plan.dropped[1].reason).toContain('unknown rule id: r1');
    expect(plan.repaired.map((n) => n.id)).toEqual(['h1']);
  });

  it('describes block ops by their block name', () => {
    const nodes = [
      entry('h1', add('a')),
      entry('h2', add('b', 'a')),
      entry('h3', { kind: 'add_block', id: 'blk', name: 'block', start: 0, end: 10, nodeId: 'a' }),
      entry('h4', { kind: 'complete_block', id: 'blk' }), // linked node has uncompleted child b
    ];
    const plan = planDropRepair(nodes);
    expect(plan.dropped).toHaveLength(1);
    expect(plan.dropped[0].description).toBe('complete_block "block"');
  });
});
