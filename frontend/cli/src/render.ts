import type { Block, BlockOccurrence, BlockRule, FilteredNode, Node, NodeFilter, Reminder } from '@worktree/core';
import {
  ROOT_ID,
  anchorDay,
  civilFromDays,
  civilFromTimestamp,
  filterTree,
  formatCivilDate,
  hasActiveFilter,
  matchesFilter,
  occurrenceStart,
  weekdayFromDays,
} from '@worktree/core';
import { deviceTzOffset } from '@worktree/client';
import type { FilterDisplayMode } from './command';
import { findNode, pathOf } from './resolve';

const SHORT_ID_LEN = 4;

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Colors are on by default only when stdout is a terminal, so piped output stays clean. */
let colorEnabled = Boolean(process.stdout.isTTY);

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LEN);
}

export function formatNode(node: Node): string {
  const parts = [node.name, `[${shortId(node.id)}]`];
  if (node.status) parts.push('✔');
  parts.push(`w:${node.weight}`);
  if (node.deadline !== undefined) parts.push(`⏰${formatLocalDateTime(node.deadline)}`);
  if (node.note !== '') parts.push(`✎ ${node.note}`);
  if (node.reminders.length > 0) {
    parts.push(`R(${node.reminders.length}):${node.reminders.map(formatReminder).join(', ')}`);
  }
  const text = parts.join(' ');
  return colorEnabled ? `${node.status ? GREEN : YELLOW}${text}${RESET}` : text;
}

/** Render the tree in the style of the linux `tree` command. */
export function renderTree(root: Node): string {
  const lines: string[] = [root.id === ROOT_ID ? '.' : formatNode(root)];
  const walk = (node: Node, prefix: string): void => {
    node.children.forEach((child, i) => {
      const isLast = i === node.children.length - 1;
      lines.push(prefix + (isLast ? '└── ' : '├── ') + formatNode(child));
      walk(child, prefix + (isLast ? '    ' : '│   '));
    });
  };
  walk(root, '');
  return lines.join('\n');
}

/**
 * Render a (sub)tree honoring the active filter.
 * hide mode: only matched nodes plus their ancestor chain (core filterTree);
 * highlight mode: every node, matches marked with a `* ` prefix.
 */
export function renderFiltered(root: Node, filter: NodeFilter, mode: FilterDisplayMode): string {
  if (!hasActiveFilter(filter)) return renderTree(root);
  const lines: string[] = [root.id === ROOT_ID ? '.' : formatNode(root)];
  if (mode === 'hide') {
    const walk = (view: FilteredNode, prefix: string): void => {
      view.children.forEach((child, i) => {
        const isLast = i === view.children.length - 1;
        lines.push(prefix + (isLast ? '└── ' : '├── ') + formatNode(child.node));
        walk(child, prefix + (isLast ? '    ' : '│   '));
      });
    };
    walk(filterTree(root, filter), '');
  } else {
    const walk = (node: Node, prefix: string): void => {
      node.children.forEach((child, i) => {
        const isLast = i === node.children.length - 1;
        const marker = matchesFilter(child, filter) ? '* ' : '';
        lines.push(prefix + (isLast ? '└── ' : '├── ') + marker + formatNode(child));
        walk(child, prefix + (isLast ? '    ' : '│   '));
      });
    };
    walk(root, '');
  }
  return lines.join('\n');
}

function formatReminder(r: Reminder): string {
  const when = formatLocalDateTime(r.deadline);
  const repeat = r.repeat !== undefined ? `+${r.repeat}ms` : '';
  const active = r.active ? '' : '/off';
  return `${r.name ?? ''}@${when}${repeat}${active}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local-time HH:MM (24h). */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Local-time `YYYY-MM-DD HH:MM:SS`. */
export function formatLocalDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Local-time `YYYY-MM-DD Weekday`. */
export function formatDayHeader(ms: number): string {
  const d = new Date(ms);
  const weekday = WEEKDAYS[d.getDay()] ?? '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${weekday}`;
}

/** One calendar block: `name [id4] HH:MM–HH:MM (node: /path | unlinked) ✔`. */
export function formatBlock(block: Block, tree: Node): string {
  const parts = [block.name, `[${shortId(block.id)}]`, `${formatTime(block.start)}–${formatTime(block.end)}`];
  const node = block.nodeId !== undefined ? findNode(tree, block.nodeId) : undefined;
  parts.push(node ? `(node: ${pathOf(tree, node.id)})` : '(unlinked)');
  if (block.status) parts.push('✔');
  if (block.note !== '') parts.push(`✎ ${block.note}`);
  const text = parts.join(' ');
  return colorEnabled ? `${block.status ? GREEN : YELLOW}${text}${RESET}` : text;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export function formatDurationMs(ms: number): string {
  const parts: string[] = [];
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((ms % MINUTE_MS) / 1000);
  const rest = ms % 1000;
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  if (rest > 0) parts.push(`${rest}ms`);
  return parts.length === 0 ? '0ms' : parts.join('');
}

/** `UTC+08:00` for a fixed offset in ms. */
export function formatOffset(tzOffset: number): string {
  const sign = tzOffset < 0 ? '-' : '+';
  const abs = Math.abs(tzOffset);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `UTC${sign}${pad(Math.floor(abs / HOUR_MS))}:${pad(Math.floor((abs % HOUR_MS) / MINUTE_MS))}`;
}

/** The rule's wall-clock `HH:MM` — in the rule's own offset, not the device's. */
export function formatRuleTime(rule: BlockRule): string {
  const { time } = civilFromTimestamp(occurrenceStart(rule, anchorDay(rule)), rule.tzOffset);
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** `15` / `last` for a month-day selector value. */
function formatMonthDay(value: number): string {
  return value === -1 ? 'last' : String(value);
}

/** `1st` / `2nd` / `last` for a bySetPos value. */
function formatPos(pos: number): string {
  if (pos === -1) return 'last';
  const suffix = pos === 1 ? 'st' : pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th';
  return `${pos}${suffix}`;
}

/** The rule's schedule in words, spelling out core's anchor-day defaults. */
export function formatSchedule(rule: BlockRule): string {
  const every = (singular: string, plural: string): string =>
    rule.interval === 1 ? singular : `every ${rule.interval} ${plural}`;
  switch (rule.freq) {
    case 'daily':
      return every('daily', 'days');
    case 'weekly': {
      const days = rule.byDay ?? [weekdayFromDays(anchorDay(rule))];
      return `${every('weekly', 'weeks')} on ${days.map((d) => WEEKDAYS[d]).join(', ')}`;
    }
    case 'monthly': {
      const base = every('monthly', 'months');
      if (rule.byMonthDay !== undefined) return `${base} on day ${rule.byMonthDay.map(formatMonthDay).join(', ')}`;
      if (rule.byDay === undefined) return `${base} on day ${rule.startDate.day}`;
      const days = rule.byDay.map((d) => WEEKDAYS[d]).join(', ');
      return rule.bySetPos === undefined ? `${base} on ${days}` : `${base} on the ${formatPos(rule.bySetPos)} ${days}`;
    }
    case 'yearly': {
      const months = rule.byMonth ?? [rule.startDate.month];
      const days = rule.byMonthDay ?? [rule.startDate.day];
      const base = every('yearly', 'years');
      if (months.length === 1 && days.length === 1) {
        return `${base} on ${MONTHS[months[0] - 1]} ${formatMonthDay(days[0])}`;
      }
      return `${base} in ${months.map((m) => MONTHS[m - 1]).join(', ')} on day ${days.map(formatMonthDay).join(', ')}`;
    }
  }
}

/** One rule: `name [id4] weekly on Wed at 09:00 1h from 2026-09-23 (off)`. */
export function formatRule(rule: BlockRule): string {
  const parts = [
    rule.name,
    `[${shortId(rule.id)}]`,
    formatSchedule(rule),
    `at ${formatRuleTime(rule)}`,
    formatDurationMs(rule.duration),
    `from ${formatCivilDate(rule.startDate)}`,
  ];
  if (rule.until !== undefined) {
    parts.push(`until ${formatCivilDate(civilFromTimestamp(rule.until, rule.tzOffset).date)}`);
  }
  if (rule.tzOffset !== deviceTzOffset()) parts.push(`(tz ${formatOffset(rule.tzOffset)})`);
  if (!rule.active) parts.push('(off)');
  if (rule.note !== '') parts.push(`✎ ${rule.note}`);
  const text = parts.join(' ');
  return colorEnabled ? `${rule.active ? YELLOW : DIM}${text}${RESET}` : text;
}

/** A derived occurrence: `↻ name [ruleId4] HH:MM–HH:MM` (device-local times). */
export function formatOccurrence(occ: BlockOccurrence): string {
  const text = `↻ ${occ.name} [${shortId(occ.ruleId)}] ${formatTime(occ.occStart)}–${formatTime(occ.occEnd)}`;
  return colorEnabled ? `${YELLOW}${text}${RESET}` : text;
}

/** A skipped occurrence day as `YYYY-MM-DD`. */
export function formatDayIndex(day: number): string {
  return formatCivilDate(civilFromDays(day));
}
