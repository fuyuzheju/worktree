import type { Node } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';

export class AmbiguousRefError extends Error {
  constructor(
    public ref: string,
    public candidates: Node[],
  ) {
    super(`ambiguous reference '${ref}': ${candidates.map((n) => `${n.name} [${n.id.slice(0, 4)}]`).join(', ')}`);
  }
}

export function collectNodes(root: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): void => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

export function findNode(root: Node, id: string): Node | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Map every node id to its parent; the root has no entry. */
export function buildParentMap(root: Node): Map<string, Node> {
  const parents = new Map<string, Node>();
  const walk = (n: Node): void => {
    for (const c of n.children) {
      parents.set(c.id, n);
      walk(c);
    }
  };
  walk(root);
  return parents;
}

/** Absolute path of a node: `/a/b/c`; the root is `/`. */
export function pathOf(root: Node, id: string): string {
  if (id === ROOT_ID) return '/';
  const parents = buildParentMap(root);
  const segments: string[] = [];
  let cur: Node | undefined = findNode(root, id);
  while (cur !== undefined && cur.id !== ROOT_ID) {
    segments.unshift(cur.name);
    cur = parents.get(cur.id);
  }
  return cur === undefined ? '/' : '/' + segments.join('/');
}

/**
 * Resolve a user reference:
 * - `root`, `/` → the root node; `.` → cwd (defaults to root); `..` → the cwd's parent
 * - refs containing `/` are paths: absolute (`/a/b`) from the root,
 *   relative (`a/b`) from the cwd; `..`/`.` segments are honored
 * - bare refs first try a child of the cwd with that name, then fall back to
 *   exact id, unique id prefix, or unique name anywhere in the tree
 */
export function resolveRef(root: Node, ref: string, cwd?: Node): Node {
  const base = cwd ?? root;
  if (ref === 'root' || ref === ROOT_ID || ref === '/') return root;
  if (ref === '.') return base;
  if (ref === '..') {
    const parent = buildParentMap(root).get(base.id);
    return parent ?? root;
  }
  if (ref.includes('/')) return resolvePath(root, base, ref);

  const cwdChild = base.children.find((c) => c.name === ref);
  if (cwdChild) return cwdChild;

  const all = collectNodes(root);
  const exact = all.filter((n) => n.id === ref);
  if (exact.length === 1) return exact[0]!;
  const prefix = all.filter((n) => n.id.startsWith(ref));
  if (prefix.length === 1) return prefix[0]!;
  if (prefix.length > 1) throw new AmbiguousRefError(ref, prefix);
  const byName = all.filter((n) => n.name === ref);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) throw new AmbiguousRefError(ref, byName);
  throw new Error(`unknown node reference: ${ref}`);
}

function resolvePath(root: Node, base: Node, path: string): Node {
  const parents = buildParentMap(root);
  const segments = path.split('/').filter((s) => s !== '' && s !== '.');
  let cur = path.startsWith('/') ? root : base;
  for (const seg of segments) {
    if (seg === '..') {
      cur = parents.get(cur.id) ?? root;
      continue;
    }
    const child = cur.children.find((c) => c.name === seg);
    if (!child) throw new Error(`no such node: ${seg}`);
    cur = child;
  }
  return cur;
}
