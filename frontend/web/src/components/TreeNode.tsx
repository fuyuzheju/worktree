import type { Node } from '@worktree/core';
import type { DisplayPrefs } from '../config';
import { connectors, formatNode } from '../render';

export interface TreeNodeProps {
  node: Node;
  ancestorIsLast: boolean[];
  isLast: boolean;
  expanded: Set<string>;
  selectedId: string | null;
  display: DisplayPrefs;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  readOnly?: boolean;
}

export function TreeNode(props: TreeNodeProps) {
  const { node, ancestorIsLast, isLast, expanded, selectedId, display, onToggle, onSelect, readOnly } =
    props;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  const bg = node.status
    ? 'bg-green-100 hover:bg-green-200'
    : 'bg-yellow-100 hover:bg-yellow-200';
  const ring = isSelected ? ' ring-2 ring-inset ring-blue-400' : '';

  return (
    <>
      <div
        data-node-id={node.id}
        className={`flex py-1 whitespace-pre-wrap wrap-break-words select-none md:whitespace-pre`}
    >
        <span>{connectors(ancestorIsLast, isLast)}</span>
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {e.stopPropagation();onToggle(node.id)}}
            aria-label={isOpen ? 'collapse' : 'expand'}
            className="inline-block h-8 w-8 cursor-pointer select-none text-gray-600 hover:text-gray-900 md:h-auto md:w-5"
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="inline-block h-8 w-8 md:h-auto md:w-5" />
        )}
        {readOnly ? (
          <span data-node-id={node.id}>{formatNode(node, display)}</span>
        ) : (
          <button
            type="button"
            data-node-id={node.id}
            className={`p-1 cursor-pointer rounded-lg max-md:flex-1 ${bg}${ring} text-left`}
            onClick={() => onSelect(node.id)}
          >
            {formatNode(node, display)}
          </button>
        )}
      </div>
      {hasChildren &&
        isOpen &&
        node.children.map((child, i) => (
          <TreeNode
            key={child.id}
            node={child}
            ancestorIsLast={[...ancestorIsLast, isLast]}
            isLast={i === node.children.length - 1}
            expanded={expanded}
            selectedId={selectedId}
            display={display}
            onToggle={onToggle}
            onSelect={onSelect}
            readOnly={readOnly}
          />
        ))}
    </>
  );
}
