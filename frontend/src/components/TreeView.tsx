import type { Node } from '@worktree/core';
import { NodeItem } from './NodeItem';

export interface TreeViewProps {
  node: Node;
  onAdd: (parentId: string, name: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}

export function TreeView({ node, onAdd, onRemove, onToggle }: TreeViewProps) {
  const children = [...node.children].sort((a, b) => a.weight - b.weight);
  return (
    <ul className="tree">
      {children.map((child) => (
        <NodeItem key={child.id} node={child} onAdd={onAdd} onRemove={onRemove} onToggle={onToggle} />
      ))}
    </ul>
  );
}
