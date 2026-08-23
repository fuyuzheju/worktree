import { ROOT_ID } from './tree';
import type { FilteredNode, Node, NodeFilter } from './types';

/** Whether the filter constrains anything — UI uses this to know if filtering is "on". */
export function hasActiveFilter(filter: NodeFilter): boolean {
  return Object.values(filter).some((v) => v !== undefined);
}

/** Pure predicate; an empty filter matches every non-root node. `now` injectable for tests. */
export function matchesFilter(node: Node, filter: NodeFilter, now: number = Date.now()): boolean {
  if (node.id === ROOT_ID) return false; // the root is a container, never a match
  const kw = filter.keyword?.toLowerCase();
  if (
    kw !== undefined &&
    kw !== '' &&
    !node.name.toLowerCase().includes(kw) &&
    !node.note.toLowerCase().includes(kw)
  ) {
    return false;
  }
  if (filter.nameContains !== undefined && !node.name.toLowerCase().includes(filter.nameContains.toLowerCase())) {
    return false;
  }
  if (filter.noteContains !== undefined && !node.note.toLowerCase().includes(filter.noteContains.toLowerCase())) {
    return false;
  }
  if (filter.deadlineBefore !== undefined && (node.deadline === undefined || node.deadline > filter.deadlineBefore)) {
    return false;
  }
  if (filter.hasDeadline === true && node.deadline === undefined) return false;
  if (filter.hasDeadline === false && node.deadline !== undefined) return false;
  if (filter.overdue === true && !(node.deadline !== undefined && !node.status && node.deadline < now)) {
    return false;
  }
  if (filter.createdAfter !== undefined && node.createdAt < filter.createdAfter) return false;
  if (filter.createdBefore !== undefined && node.createdAt > filter.createdBefore) return false;
  if (filter.status === true && !node.status) return false;
  if (filter.status === false && node.status) return false;
  return true;
}

/**
 * Hide-style view: matched nodes plus their ancestor chain (ancestors carry
 * matched=false as context); non-matching subtrees are pruned. With an empty
 * filter the view is the full tree with every non-root node matched.
 */
export function filterTree(root: Node, filter: NodeFilter, now: number = Date.now()): FilteredNode {
  const build = (node: Node): { view: FilteredNode; keep: boolean } => {
    const children: FilteredNode[] = [];
    let keep = false;
    for (const child of node.children) {
      const r = build(child);
      if (r.keep) children.push(r.view);
      keep = keep || r.keep;
    }
    const matched = matchesFilter(node, filter, now);
    return { view: { node, matched, children }, keep: keep || matched };
  };
  return build(root).view;
}
