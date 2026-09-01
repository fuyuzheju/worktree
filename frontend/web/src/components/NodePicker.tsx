import { useMemo, useState } from 'react';
import { filterTree, hasActiveFilter } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { flattenTree } from '../tree-utils';
import { highlightView } from '../filter-view';
import { useFilter } from '../filter-context';
import { FilterBar } from './FilterBar';
import { TreeView } from './TreeView';

/**
 * Transient full-tree selector: the user clicks a node to link it to a block.
 * Picks are immediate — clicking a row closes the picker.
 */
export function NodePicker(props: {
  tree: Node;
  display: DisplayPrefs;
  /** The currently linked node (highlighted in the tree). */
  currentId: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { tree, display, currentId, onPick, onClose } = props;
  const { filter, mode, setFilter, setMode } = useFilter();
  // Start fully expanded: the user asked to see the whole tree to pick from.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(flattenTree(tree).map((e) => e.node.id)),
  );

  const view = useMemo(
    () => (mode === 'hide' ? filterTree(tree, filter) : highlightView(tree, filter)),
    [tree, filter, mode],
  );
  const filterActive = hasActiveFilter(filter);

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      data-testid="node-picker"
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-lg border border-gray-300 bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t('calendar.pickTitle')}</h2>
            <p className="mt-1 text-xs text-gray-500">{t('calendar.pickHint')}</p>
          </div>
          <FilterBar filter={filter} mode={mode} onFilterChange={setFilter} onModeChange={setMode} />
        </div>
        <div className="mt-2">
          <TreeView
            root={view}
            expanded={expanded}
            selectedId={currentId}
            display={display}
            onToggle={toggle}
            onSelect={(id) => {
              onPick(id);
              onClose();
            }}
            filterActive={filterActive}
            highlightMatches={mode === 'highlight'}
          />
        </div>
        <button
          type="button"
          data-testid="node-picker-clear"
          onClick={() => {
            onPick(null);
            onClose();
          }}
          className="mt-3 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          {t('calendar.clearLink')}
        </button>
      </div>
    </div>
  );
}
