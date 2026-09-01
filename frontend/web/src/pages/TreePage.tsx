import { useEffect, useMemo, useRef, useState } from 'react';
import { filterTree, hasActiveFilter } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { AppConfig, DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { useIsMobile } from '../hooks/useMediaQuery';
import { ancestorIds, findNode } from '../tree-utils';
import { TreeView } from '../components/TreeView';
import { FilterBar } from '../components/FilterBar';
import { NodeDetailPanel } from '../components/NodeDetailPanel';
import { highlightView } from '../filter-view';
import { useFilter } from '../filter-context';

export function TreePage(props: {
  tree: Node;
  client: WorktreeClient;
  display: DisplayPrefs;
  updateConfig: (patch: Partial<AppConfig>) => void;
  /** Deep link: select this node when the page first mounts. */
  initialNodeId?: string;
  /** Deep link while mounted (e.g. from a service-worker message); nonce forces re-focus. */
  focusNode?: { id: string; nonce: number } | null;
}) {
  const { t } = useI18n();
  const { tree, client, display, updateConfig, initialNodeId, focusNode } = props;
  const isMobile = useIsMobile();
  const { filter, mode, setFilter, setMode } = useFilter();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => (initialNodeId === undefined ? new Set() : new Set(ancestorIds(tree, initialNodeId))),
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialNodeId ?? null);

  const filterActive = hasActiveFilter(filter);
  const view = useMemo(
    () => (mode === 'hide' ? filterTree(tree, filter) : highlightView(tree, filter)),
    [tree, filter, mode],
  );

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const select = (id: string): void => {
    setSelectedId(id);
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  useEffect(() => {
    if (selectedId !== null && findNode(tree, selectedId) === undefined) setSelectedId(null);
  }, [tree, selectedId]);

  useEffect(() => {
    if (focusNode === null || focusNode === undefined) return;
    if (findNode(tree, focusNode.id) === undefined) return;
    setSelectedId(focusNode.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of ancestorIds(tree, focusNode.id)) next.add(id);
      next.add(focusNode.id);
      return next;
    });
  }, [focusNode, tree]);

  // Clicking blank space (anything that is not a node row or the detail
  // panel) clears the selection.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (el === null) return;
    const onBlankClick = (e: MouseEvent): void => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-node-id]') !== null) return;
      if (target.closest('[data-detail]') !== null) return;
      setSelectedId(null);
    };
    el.addEventListener('click', onBlankClick);
    return () => el.removeEventListener('click', onBlankClick);
  }, []);

  const selected = selectedId !== null ? findNode(tree, selectedId) : undefined;

  const close = (): void => setSelectedId(null);

  return (
    <div ref={rootRef} className={`flex w-full flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
      <div className="relative flex min-w-0 flex-1 overflow-auto">
        <div className="flex min-w-0 flex-1 bg-gray-100">
          <TreeView
            root={view}
            expanded={expanded}
            selectedId={selectedId}
            display={display}
            onToggle={toggle}
            onSelect={select}
            filterActive={filterActive}
            highlightMatches={mode === 'highlight'}
          />
        </div>
        <div className="absolute right-2 top-0 z-10">
          <FilterBar filter={filter} mode={mode} onFilterChange={setFilter} onModeChange={setMode} />
        </div>
      </div>
      {isMobile ? (
        selected !== undefined && (
          <div className="max-h-[55vh] min-h-[55vh] w-full overflow-y-auto rounded-t-2xl border-t border-gray-300 bg-white shadow-2xl">
            <NodeDetailPanel bare node={selected} client={client} onClose={close} />
          </div>
        )
      ) : (
        <div className="w-96 shrink-0">
          {selected !== undefined ? (
            <NodeDetailPanel bare node={selected} client={client} onClose={close} />
          ) : (
            <div className="rounded border border-gray-300 bg-white p-4 text-sm text-gray-500">
              {t('tree.selectHint')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
