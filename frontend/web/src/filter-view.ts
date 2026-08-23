import { matchesFilter } from '@worktree/core';
import type { FilteredNode, Node, NodeFilter } from '@worktree/core';

/** Highlight-mode view: every node present, matched flags from the filter. */
export function highlightView(root: Node, filter: NodeFilter): FilteredNode {
  const build = (node: Node): FilteredNode => ({
    node,
    matched: matchesFilter(node, filter),
    children: node.children.map(build),
  });
  return build(root);
}
