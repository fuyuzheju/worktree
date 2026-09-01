import { ROOT_ID } from '@worktree/core';
import type { Node, Reminder } from '@worktree/core';
import type { DisplayPrefs } from './config';

const SHORT_ID_LEN = 4;

export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LEN);
}

/** One node row, same token order as the CLI: `name [id4] ✔ w:<weight> ⏰deadline ✎ note R(n):...` */
export function formatNode(node: Node, display: DisplayPrefs): string {
  const parts = [node.name];
  if (display.showId) parts.push(`[${shortId(node.id)}]`);
  if (node.status) parts.push('✔');
  if (display.showWeight) parts.push(`w:${node.weight}`);
  if (node.deadline !== undefined) parts.push(`⏰${new Date(node.deadline).toISOString()}`);
  if (node.note !== '') parts.push(`✎ ${node.note}`);
  if (display.showReminders && node.reminders.length > 0) {
    parts.push(`R(${node.reminders.length}):${node.reminders.map(formatReminder).join(', ')}`);
  }
  return parts.join(' ');
}

export function formatReminder(r: Reminder): string {
  const when = new Date(r.deadline).toISOString();
  const repeat = r.repeat !== undefined ? `+${r.repeat}ms` : '';
  const active = r.active ? '' : '/off';
  return `${r.name ?? ''}@${when}${repeat}${active}`;
}

/**
 * The `tree`-command connector prefix for a node at the given position.
 * `ancestorIsLast` holds one boolean per ancestor (closest ancestor last):
 * false ancestors continue with `│   `, true ones with four spaces.
 */
export function connectors(ancestorIsLast: boolean[], isLast: boolean): string {
  const prefix = ancestorIsLast.map((a) => (a ? '    ' : '│   ')).join('');
  return prefix + (isLast ? '└── ' : '├── ');
}

/** The tree headline: `rootName` for the worktree root, the node itself otherwise. */
export function rootLine(root: Node, display: DisplayPrefs, rootName = '.'): string {
  return root.id === ROOT_ID ? rootName : formatNode(root, display);
}
