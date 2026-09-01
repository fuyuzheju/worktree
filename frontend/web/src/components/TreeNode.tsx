import type { FilteredNode } from '@worktree/core';
import type { DisplayPrefs } from '../config';
import { connectors } from '../render';
import { ChevronDownIcon, ChevronRightIcon } from './icons';
import { NodeLabel } from './NodeLabel';

/** How a node differs from the other side of a conflict. */
export type DiffStyle = 'only' | 'changed';

export interface TreeNodeProps {
  view: FilteredNode;
  ancestorIsLast: boolean[];
  isLast: boolean;
  expanded: Set<string>;
  selectedId: string | null;
  display: DisplayPrefs;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  readOnly?: boolean;
  filterActive?: boolean;
  /** Highlight-mode only: matched rows get the blue outline; hide mode leaves them unstyled. */
  highlightMatches?: boolean;
  /** Conflict page: nodes differing from the other version, by style. */
  highlight?: ReadonlyMap<string, DiffStyle>;
}

const HIGHLIGHT_CLASS: Record<DiffStyle, string> = {
  only: ' bg-rose-100',
  changed: ' bg-amber-100',
};

export function TreeNode(props: TreeNodeProps) {
  const {
    view,
    ancestorIsLast,
    isLast,
    expanded,
    selectedId,
    display,
    onToggle,
    onSelect,
    readOnly,
    filterActive,
    highlightMatches,
  } = props;
  const node = view.node;
  const hasChildren = view.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const highlight = props.highlight?.get(node.id);

  const bg = node.status
    ? 'bg-green-100 hover:bg-green-200'
    : 'bg-yellow-100 hover:bg-yellow-200';
  const ring = isSelected ? ' ring-2 ring-inset ring-blue-400' : '';
  // An active filter styles the row: matched rows get the blue outline only
  // in highlight mode; non-matching rows (context ancestors in hide mode)
  // are dimmed in both modes.
  const filterStyle =
    filterActive === true
      ? view.matched
        ? highlightMatches
          ? ' outline outline-2 outline-blue-400'
          : ''
        : ' opacity-50'
      : '';

  return (
    <>
      <div
        data-node-id={node.id}
        className={`flex py-1 whitespace-pre-wrap wrap-break-words select-none md:whitespace-pre${highlight ? HIGHLIGHT_CLASS[highlight] : ''}`}
    >
        <span>{connectors(ancestorIsLast, isLast)}</span>
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {e.stopPropagation();onToggle(node.id)}}
            aria-label={isOpen ? 'collapse' : 'expand'}
            className="inline-block h-8 w-8 cursor-pointer select-none text-gray-600 hover:text-gray-900 md:h-auto md:w-5"
          >
            {isOpen ? (
              <ChevronDownIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 md:h-3.5 md:w-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block h-8 w-8 md:h-auto md:w-5" />
        )}
        {readOnly ? (
          <span data-node-id={node.id} className={filterStyle}><NodeLabel node={node} display={display} /></span>
        ) : (
          <button
            type="button"
            data-node-id={node.id}
            className={`p-1 cursor-pointer rounded-lg max-md:flex-1 ${bg}${ring}${filterStyle} text-left`}
            onClick={() => onSelect(node.id)}
          >
            <NodeLabel node={node} display={display} />
          </button>
        )}
      </div>
      {hasChildren &&
        isOpen &&
        view.children.map((child, i) => (
          <TreeNode
            key={child.node.id}
            view={child}
            ancestorIsLast={[...ancestorIsLast, isLast]}
            isLast={i === view.children.length - 1}
            expanded={expanded}
            selectedId={selectedId}
            display={display}
            onToggle={onToggle}
            onSelect={onSelect}
            readOnly={readOnly}
            filterActive={filterActive}
            highlightMatches={highlightMatches}
            highlight={props.highlight}
          />
        ))}
    </>
  );
}
