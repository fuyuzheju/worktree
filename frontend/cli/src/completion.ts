import type { Node } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import { findNode, resolvePath } from './resolve';
import { COMMANDS as REGISTRY } from './commands';

/** Every name (aliases included) a user can type as a command. */
export const COMMANDS = REGISTRY.flatMap((c) => [c.name, ...(c.aliases ?? [])]);

const REMINDER_SUB = ['add', 'rm', 'edit'];
const RESOLVE_CHOICES = ['server', 'local'];
const RM_FLAGS = ['-r', '--recursive'];

/**
 * Complete a fixed option list: single match gets a trailing space.
 * The second return value is the matched token — readline replaces it with
 * the hit (or with the hits' common prefix when there are several).
 */
function completeFixed(options: string[], token: string): [string[], string] {
  const hits = options.filter((o) => o.startsWith(token));
  if (hits.length === 1) return [[hits[0]! + ' '], token];
  return [hits, token];
}

/**
 * Complete a node ref (bare name or path) against the tree.
 * Single dir match → `name/`; single leaf match → `name `; multiple → readline
 * fills their common prefix.
 */
function completeRef(root: Node, cwd: Node, token: string): [string[], string] {
  if (token === '..') return [['../'], token];
  if (token === '.') return [['./'], token];
  const slashIdx = token.lastIndexOf('/');
  let dir: Node;
  let pathPrefix: string;
  let prefix: string;
  if (slashIdx === -1) {
    dir = cwd;
    pathPrefix = '';
    prefix = token;
  } else {
    const dirPart = token.slice(0, slashIdx);
    try {
      dir = resolvePath(root, cwd, dirPart === '' ? '/' : dirPart);
    } catch {
      return [[], token];
    }
    pathPrefix = token.slice(0, slashIdx + 1);
    prefix = token.slice(slashIdx + 1);
  }
  const names = dir.children.map((c) => c.name).filter((n) => n.startsWith(prefix));
  if (names.length === 1) {
    const node = dir.children.find((c) => c.name === names[0])!;
    return [[pathPrefix + names[0]! + (node.children.length > 0 ? '/' : ' ')], token];
  }
  return [names.map((n) => pathPrefix + n), token];
}

/** All reminder ids anywhere in the tree (for `reminder rm` / `reminder edit`). */
function collectReminderIds(root: Node): string[] {
  const ids: string[] = [];
  const walk = (n: Node): void => {
    for (const r of n.reminders) ids.push(r.id);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return ids;
}

/**
 * readline completer for the whole input line.
 * Returns [hits, replacement] — readline replaces the current word with `replacement`.
 */
export function completeLine(root: Node, cwdId: string, line: string): [string[], string] {
  const trailingSpace = /[ \t]$/.test(line);
  const tokens = line.trim().length === 0 ? [''] : line.trim().split(/\s+/);
  const words = trailingSpace ? [...tokens, ''] : tokens;
  const last = words[words.length - 1] ?? '';
  const cmd = words[0] ?? '';
  const cwd = findNode(root, cwdId) ?? root;

  if (cmd === '' || words.length === 1) return completeFixed(COMMANDS, last);

  const position = words.length;
  switch (cmd) {
    case 'reminder':
      if (position === 2) return completeFixed(REMINDER_SUB, last);
      if (position === 3 && words[1] === 'add') return completeRef(root, cwd, last);
      if (position === 3 && (words[1] === 'rm' || words[1] === 'edit')) {
        return completeFixed(collectReminderIds(root), last);
      }
      return [[], last];
    case 'resolve':
      if (position === 2) return completeFixed(RESOLVE_CHOICES, last);
      return [[], last];
    case 'rm':
      if (position === 2 && last.startsWith('-')) return completeFixed(RM_FLAGS, last);
      if (position === 2) return completeRef(root, cwd, last);
      if (position === 3 && words[1]?.startsWith('-')) return completeRef(root, cwd, last);
      return [[], last];
    case 'cd':
    case 'tree':
    case 'ls':
    case 'cpl':
    case 'uncpl':
    case 'rename':
      if (position === 2) return completeRef(root, cwd, last);
      return [[], last];
    case 'mv':
    case 'cp':
      if (position === 2 || position === 3) return completeRef(root, cwd, last);
      return [[], last];
    case 'add':
      if (position === 3) return completeRef(root, cwd, last);
      return [[], last];
    default:
      return [[], last];
  }
}
