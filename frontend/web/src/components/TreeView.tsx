import type { FilteredNode } from '@worktree/core';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { rootLine } from '../render';
import { TreeNode } from './TreeNode';
import type { DiffStyle } from './TreeNode';

export interface TreeViewProps {
  root: FilteredNode;
  expanded: Set<string>;
  selectedId: string | null;
  display: DisplayPrefs;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  /** Conflict page: rows are not selectable, expansion still works. */
  readOnly?: boolean;
  /** Whether a filter constrains the view (drives dim/highlight styling and the empty state). */
  filterActive?: boolean;
  /** Highlight-mode only: matched rows get the blue outline; hide mode leaves them unstyled. */
  highlightMatches?: boolean;
  /** Conflict page: nodes differing from the other version, by style. */
  highlight?: ReadonlyMap<string, DiffStyle>;
}

export function TreeView(props: TreeViewProps) {
  const { t } = useI18n();
  const { root, expanded, selectedId, display, onToggle, onSelect, readOnly, filterActive, highlightMatches } = props;
  const node = root.node;

  return (
    <div className="w-full px-4 font-mono text-sm leading-6" data-testid="tree-view">
      {readOnly ? (
        <div className="text-gray-700">{rootLine(node, display, t('tree.rootName'))}</div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          data-node-id={node.id}
          className={`block px-2 text-left whitespace-pre-wrap wrap-break-words py-1 select-none cursor-pointer text-gray-700 rounded-lg bg-gray-200 hover:bg-gray-300 md:whitespace-pre md:py-0${
            selectedId === node.id ? ' ring-2 ring-inset ring-blue-400' : ''
          }`}
        >
          {rootLine(node, display, t('tree.rootName'))}
        </button>
      )}
      {root.children.length === 0 && (
        <div className="pl-4 text-gray-400">
          {filterActive === true ? t('tree.filteredEmpty') : t('tree.empty')}
        </div>
      )}
      {root.children.map((child, i) => (
        <TreeNode
          key={child.node.id}
          view={child}
          ancestorIsLast={[]}
          isLast={i === root.children.length - 1}
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
    </div>
  );
}
