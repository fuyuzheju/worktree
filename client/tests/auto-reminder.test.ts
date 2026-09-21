import { describe, expect, it } from 'vitest';
import { ROOT_ID } from '@worktree/core';
import type { Node, Operation } from '@worktree/core';
import { WorktreeClient } from '../src/client';
import { autoReminderDeadline, clampAutoReminderPct } from '../src/autoReminder';

const newClient = () => new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'alice', token: 'test-token' });

const childOf = (tree: Node, id: string): Node => {
  const node = tree.children.find((n) => n.id === id);
  if (node === undefined) throw new Error(`missing child ${id}`);
  return node;
};

/** A node with a known createdAt, seeded directly through the op interface. */
const seedNode = (c: WorktreeClient, createdAt: number): void => {
  c.apply({ kind: 'add', parentId: ROOT_ID, id: 'n1', name: 'task', weight: 1, createdAt });
};

/** The op of the most recently queued pending add, or null. */
const lastOp = (c: WorktreeClient): Operation | null => {
  const pending = c.getPending().filter((p) => p.kind === 'add');
  return pending.at(-1)?.op ?? null;
};

const createdAt = new Date(2026, 0, 1, 12, 0, 0).getTime();
const deadline = createdAt + 10 * 24 * 3600 * 1000;

describe('autoReminderDeadline', () => {
  it('computes the fire time from the remaining percentage', () => {
    expect(autoReminderDeadline(1000, 2000, 15)).toBe(1850);
    expect(autoReminderDeadline(1000, 2000, 50)).toBe(1500);
    expect(autoReminderDeadline(1000, 2000, 1)).toBe(1990);
    expect(autoReminderDeadline(1000, 2000, 99)).toBe(1010);
  });
});

describe('clampAutoReminderPct', () => {
  it('clamps and rounds to 1..99', () => {
    expect(clampAutoReminderPct(0)).toBe(1);
    expect(clampAutoReminderPct(500)).toBe(99);
    expect(clampAutoReminderPct(15.4)).toBe(15);
    expect(clampAutoReminderPct(15.5)).toBe(16);
    expect(clampAutoReminderPct(1)).toBe(1);
    expect(clampAutoReminderPct(99)).toBe(99);
  });
});

describe('setDeadline auto-reminder', () => {
  it('creates one auto reminder on the first deadline, firing with pct of the window remaining', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline, { autoReminderEnabled: true, autoReminderPct: 15 });

    const node = childOf(c.getTree(), 'n1');
    expect(node.deadline).toBe(deadline);
    expect(node.reminders).toHaveLength(1);
    expect(node.reminders[0]?.auto).toBe(true);
    expect(node.reminders[0]?.deadline).toBe(autoReminderDeadline(createdAt, deadline, 15));

    const op = lastOp(c);
    expect(op?.kind).toBe('add_reminder');
    if (op?.kind === 'add_reminder') expect(op.auto).toBe(true);
  });

  it('creates nothing without opts', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline);
    expect(childOf(c.getTree(), 'n1').reminders).toHaveLength(0);
  });

  it('creates nothing when the feature is disabled', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline, { autoReminderEnabled: false, autoReminderPct: 15 });
    expect(childOf(c.getTree(), 'n1').reminders).toHaveLength(0);
  });

  it('skips legacy nodes without a createdAt', () => {
    const c = newClient();
    seedNode(c, 0);
    c.setDeadline('n1', deadline, { autoReminderEnabled: true, autoReminderPct: 15 });
    expect(childOf(c.getTree(), 'n1').reminders).toHaveLength(0);
  });

  it('skips a deadline not after createdAt', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', createdAt, { autoReminderEnabled: true, autoReminderPct: 15 });
    expect(childOf(c.getTree(), 'n1').reminders).toHaveLength(0);
  });

  it('recomputes the auto reminder on deadline changes and leaves manual reminders alone', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline, { autoReminderEnabled: true, autoReminderPct: 15 });
    const manual = c.addReminder('n1', 'manual', deadline);
    const later = deadline + 24 * 3600 * 1000;

    c.setDeadline('n1', later, { autoReminderEnabled: true, autoReminderPct: 30 });

    const node = childOf(c.getTree(), 'n1');
    const auto = node.reminders.find((r) => r.auto);
    const manualRmd = node.reminders.find((r) => r.id === manual);
    expect(auto?.deadline).toBe(autoReminderDeadline(createdAt, later, 30));
    expect(manualRmd?.deadline).toBe(deadline);
  });

  it('does not recreate an auto reminder the user deleted', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline, { autoReminderEnabled: true, autoReminderPct: 15 });
    const auto = childOf(c.getTree(), 'n1').reminders.find((r) => r.auto);
    if (auto === undefined) throw new Error('missing auto reminder');
    c.removeReminder(auto.id);

    c.setDeadline('n1', deadline + 1000, { autoReminderEnabled: true, autoReminderPct: 15 });
    expect(childOf(c.getTree(), 'n1').reminders.filter((r) => r.auto)).toHaveLength(0);
  });

  it('removes auto reminders when the deadline is cleared, even when disabled', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline, { autoReminderEnabled: true, autoReminderPct: 15 });
    const manual = c.addReminder('n1', 'manual', deadline);

    c.setDeadline('n1', null, { autoReminderEnabled: false, autoReminderPct: 15 });

    const node = childOf(c.getTree(), 'n1');
    expect(node.deadline).toBeUndefined();
    expect(node.reminders.filter((r) => r.auto)).toHaveLength(0);
    expect(node.reminders.map((r) => r.id)).toEqual([manual]);
  });

  it('re-attaches an orphaned auto reminder instead of duplicating it', () => {
    const c = newClient();
    seedNode(c, createdAt);
    c.setDeadline('n1', deadline, { autoReminderEnabled: true, autoReminderPct: 15 });
    // Simulate an undo of the deadline edit alone: deadline gone, auto reminder left behind.
    c.apply({ kind: 'edit_node', id: 'n1', deadline: null });

    const later = deadline + 24 * 3600 * 1000;
    c.setDeadline('n1', later, { autoReminderEnabled: true, autoReminderPct: 15 });

    const node = childOf(c.getTree(), 'n1');
    expect(node.reminders.filter((r) => r.auto)).toHaveLength(1);
    expect(node.reminders.find((r) => r.auto)?.deadline).toBe(autoReminderDeadline(createdAt, later, 15));
  });
});
