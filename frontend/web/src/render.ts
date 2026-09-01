import type { Node, Reminder } from '@worktree/core';
import type { DisplayPrefs } from './config';

const SHORT_ID_LEN = 4;

export function shortId(id: string): string {
  return id.slice(0, SHORT_ID_LEN);
}

/** One token of a node row, in CLI order: `name [id4] ✔ w:<weight> ⏰deadline ✎ note R(n):...`. */
export type NodeRowPart =
  | { type: 'name'; text: string }
  | { type: 'id'; id: string }
  | { type: 'status' }
  | { type: 'weight'; weight: number }
  | { type: 'deadline'; ms: number }
  | { type: 'note'; text: string }
  | { type: 'reminders'; count: number; text: string };

/** The token list behind a node row, shared by the CLI-style text and the icon-based web rendering. */
export function nodeRowParts(node: Node, display: DisplayPrefs): NodeRowPart[] {
  const parts: NodeRowPart[] = [{ type: 'name', text: node.name }];
  if (display.showId) parts.push({ type: 'id', id: node.id });
  if (node.status) parts.push({ type: 'status' });
  if (display.showWeight) parts.push({ type: 'weight', weight: node.weight });
  if (node.deadline !== undefined) parts.push({ type: 'deadline', ms: node.deadline });
  if (node.note !== '') parts.push({ type: 'note', text: node.note });
  if (display.showReminders && node.reminders.length > 0) {
    parts.push({
      type: 'reminders',
      count: node.reminders.length,
      text: node.reminders.map(formatReminder).join(', '),
    });
  }
  return parts;
}

/** Same token order as the CLI: `name [id4] ✔ w:<weight> ⏰deadline ✎ note R(n):...` */
export function formatNode(node: Node, display: DisplayPrefs): string {
  return nodeRowParts(node, display)
    .map((part) => {
      switch (part.type) {
        case 'name':
          return part.text;
        case 'id':
          return `[${shortId(part.id)}]`;
        case 'status':
          return '✔';
        case 'weight':
          return `w:${part.weight}`;
        case 'deadline':
          return `⏰${new Date(part.ms).toISOString()}`;
        case 'note':
          return `✎ ${part.text}`;
        case 'reminders':
          return `R(${part.count}):${part.text}`;
      }
    })
    .join(' ');
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

