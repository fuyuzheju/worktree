import { useState } from 'react';
import type { Node } from '@worktree/core';
import { ReminderList } from './ReminderList';
import { TreeView } from './TreeView';

export interface NodeItemProps {
  node: Node;
  onAdd: (parentId: string, name: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}

export function NodeItem({ node, onAdd, onRemove, onToggle }: NodeItemProps) {
  const [expanded, setExpanded] = useState(true);
  return (
    <li className={`node ${node.status ? 'completed' : ''}`}>
      <div className="node-row">
        <button onClick={() => setExpanded((e) => !e)}>{expanded ? '▾' : '▸'}</button>
        <input type="checkbox" checked={node.status} onChange={() => onToggle(node.id)} />
        <span className="name">{node.name}</span>
        <span className="weight">w:{node.weight}</span>
        <button onClick={() => onAdd(node.id, 'new node')}>+</button>
        <button onClick={() => onRemove(node.id)}>×</button>
      </div>
      {expanded && (
        <>
          <ReminderList reminders={node.reminders} />
          <TreeView node={node} onAdd={onAdd} onRemove={onRemove} onToggle={onToggle} />
        </>
      )}
    </li>
  );
}
