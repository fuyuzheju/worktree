import type { Block, Node, Timestamp } from './types';

const DAY = 24 * 60 * 60 * 1000;

export interface NodeStats {
  total: number;
  completed: number;
  incomplete: number;
  /** completed / total; null when there are no nodes. */
  completionRatio: number | null;
}

export interface ReminderStats {
  total: number;
  /** Reminders with active = true. */
  active: number;
  /** Active reminders past their deadline whose node is still uncompleted. */
  missed: number;
}

export interface BlockStats {
  total: number;
  completed: number;
  /** completed / total; null when there are no blocks. */
  completionRatio: number | null;
  /** Blocks linked to a node (nodeId set). */
  linked: number;
  /** Total clamped overlap of blocks with the next 7 days, in hours. */
  upcoming7dHours: number;
}

export interface TimingStats {
  /**
   * Average of (deadline − completedAt) / (deadline − createdAt) over
   * completed nodes with a deadline; positive = buffer remaining at
   * completion, negative = finished after the deadline. null when no
   * qualifying node. Nodes with completedAt = 0 (completed by a legacy op)
   * are excluded.
   */
  completionBufferRatio: number | null;
  /**
   * Average of (deadline − block.end) / (deadline − createdAt) over nodes
   * linked to a block; the block end is the planned completion time.
   * null when no qualifying node.
   */
  blockBufferRatio: number | null;
  /** Uncompleted nodes past their deadline. */
  overdueIncomplete: number;
  /** Fraction of completed deadline nodes that finished after the deadline. */
  lateCompletionRatio: number | null;
  /** Nodes completed within the last 7 days. */
  completed7d: number;
  /** Nodes completed within the last 30 days. */
  completed30d: number;
  /** Mean age of uncompleted nodes, in days; null when none. */
  avgIncompleteAgeDays: number | null;
  /** Age of the oldest uncompleted node, in days; null when none. */
  oldestIncompleteDays: number | null;
}

export interface Stats {
  nodes: NodeStats;
  reminders: ReminderStats;
  blocks: BlockStats;
  timing: TimingStats;
}

/** Time-management statistics derived from the rendered state; pure, no I/O. */
export function computeStats(tree: Node, blocks: Block[], now: Timestamp): Stats {
  const nodes: NodeStats = { total: 0, completed: 0, incomplete: 0, completionRatio: null };
  const reminders: ReminderStats = { total: 0, active: 0, missed: 0 };
  const timing: TimingStats = {
    completionBufferRatio: null,
    blockBufferRatio: null,
    overdueIncomplete: 0,
    lateCompletionRatio: null,
    completed7d: 0,
    completed30d: 0,
    avgIncompleteAgeDays: null,
    oldestIncompleteDays: null,
  };

  let bufferSum = 0;
  let bufferCount = 0;
  let lateCount = 0;
  let lateTotal = 0;
  let incompleteAgeSum = 0;
  let incompleteAgeMax = 0;
  let incompleteAgeCount = 0;

  const visit = (node: Node): void => {
    nodes.total += 1;
    if (node.status) nodes.completed += 1;
    else nodes.incomplete += 1;

    for (const r of node.reminders) {
      reminders.total += 1;
      if (r.active) {
        reminders.active += 1;
        if (r.deadline < now && !node.status) reminders.missed += 1;
      }
    }

    if (node.status) {
      if (node.completedAt > 0 && node.completedAt > now - 7 * DAY) timing.completed7d += 1;
      if (node.completedAt > 0 && node.completedAt > now - 30 * DAY) timing.completed30d += 1;
      const deadline = node.deadline;
      if (deadline !== undefined && deadline > node.createdAt && node.completedAt > 0) {
        bufferSum += (deadline - node.completedAt) / (deadline - node.createdAt);
        bufferCount += 1;
        if (node.completedAt > deadline) lateCount += 1;
        lateTotal += 1;
      }
    } else {
      if (node.deadline !== undefined && node.deadline < now) timing.overdueIncomplete += 1;
      if (node.createdAt > 0) {
        const age = now - node.createdAt;
        incompleteAgeSum += age;
        incompleteAgeCount += 1;
        if (age > incompleteAgeMax) incompleteAgeMax = age;
      }
    }

    for (const child of node.children) visit(child);
  };
  for (const child of tree.children) visit(child);

  if (nodes.total > 0) nodes.completionRatio = nodes.completed / nodes.total;
  if (bufferCount > 0) {
    timing.completionBufferRatio = bufferSum / bufferCount;
    timing.lateCompletionRatio = lateCount / lateTotal;
  }
  if (incompleteAgeCount > 0) {
    timing.avgIncompleteAgeDays = incompleteAgeSum / incompleteAgeCount / DAY;
    timing.oldestIncompleteDays = incompleteAgeMax / DAY;
  }

  const blockStats = computeBlockStats(blocks, now);
  timing.blockBufferRatio = computeBlockBufferRatio(tree, blocks);

  return { nodes, reminders, blocks: blockStats, timing };
}

function computeBlockStats(blocks: Block[], now: Timestamp): BlockStats {
  const stats: BlockStats = { total: 0, completed: 0, completionRatio: null, linked: 0, upcoming7dHours: 0 };
  const windowEnd = now + 7 * DAY;
  for (const b of blocks) {
    stats.total += 1;
    if (b.status) stats.completed += 1;
    if (b.nodeId !== undefined) stats.linked += 1;
    if (b.end > now && b.start < windowEnd) {
      stats.upcoming7dHours += (Math.min(b.end, windowEnd) - Math.max(b.start, now)) / (60 * 60 * 1000);
    }
  }
  if (stats.total > 0) stats.completionRatio = stats.completed / stats.total;
  return stats;
}

function computeBlockBufferRatio(tree: Node, blocks: Block[]): number | null {
  const endByNodeId = new Map<string, Timestamp>();
  for (const b of blocks) {
    if (b.nodeId !== undefined) endByNodeId.set(b.nodeId, b.end);
  }
  let sum = 0;
  let count = 0;
  const visit = (node: Node): void => {
    const end = endByNodeId.get(node.id);
    if (end !== undefined && node.deadline !== undefined && node.deadline > node.createdAt) {
      sum += (node.deadline - end) / (node.deadline - node.createdAt);
      count += 1;
    }
    for (const child of node.children) visit(child);
  };
  for (const child of tree.children) visit(child);
  return count > 0 ? sum / count : null;
}
