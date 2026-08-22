import type { Node } from '@worktree/core';

export interface FlatEntry {
  node: Node;
  depth: number;
  parentId: string | null;
}

/** Depth-first flattening of the tree, root included. */
export function flattenTree(root: Node): FlatEntry[] {
  const out: FlatEntry[] = [];
  const walk = (node: Node, depth: number, parentId: string | null): void => {
    out.push({ node, depth, parentId });
    for (const child of node.children) walk(child, depth + 1, node.id);
  };
  walk(root, 0, null);
  return out;
}

/** The node's descendants (excluding itself), as a set of ids. */
export function descendants(root: Node, id: string): Set<string> {
  const found = findNode(root, id);
  if (!found) return new Set();
  const out = new Set<string>();
  const walk = (node: Node): void => {
    for (const child of node.children) {
      out.add(child.id);
      walk(child);
    }
  };
  walk(found);
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
