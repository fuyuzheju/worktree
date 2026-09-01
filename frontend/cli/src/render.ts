import type { FilteredNode, Node, NodeFilter, Reminder } from '@worktree/core';
import { ROOT_ID, filterTree, hasActiveFilter, matchesFilter } from '@worktree/core';
import type { FilterDisplayMode } from './command';

const SHORT_ID_LEN = 4;

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
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
  if (node.deadline !== undefined) parts.push(`⏰${new Date(node.deadline).toISOString()}`);
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
  const when = new Date(r.deadline).toISOString();
  const repeat = r.repeat !== undefined ? `+${r.repeat}ms` : '';
  const active = r.active ? '' : '/off';
  return `${r.name ?? ''}@${when}${repeat}${active}`;
}
