import { useEffect, useRef, useState } from 'react';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { useIsMobile } from '../hooks/useMediaQuery';
import { findNode } from '../tree-utils';
import { TreeView } from '../components/TreeView';
import { NodeDetailPanel } from '../components/NodeDetailPanel';

export function TreePage(props: {
  tree: Node;
  client: WorktreeClient;
  display: DisplayPrefs;
}) {
  const { t } = useI18n();
  const { tree, client, display } = props;
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    <div ref={rootRef} className={`flex ${isMobile?"flex-col":""} w-full flex-1 min-h-0`}>
      <div className="flex min-w-0 flex-1 overflow-auto bg-gray-100">
        {/* <div
          className={`flex-1 flex rounded border border-gray-300 bg-white p-3`}
        > */}
          <TreeView
            root={tree}
            expanded={expanded}
            selectedId={selectedId}
            display={display}
            onToggle={toggle}
            onSelect={select}
          />
        {/* </div> */}
      </div>
      {isMobile ? (
        selected !== undefined && (
          <div className="max-h-[55vh] overflow-y-auto rounded-t-2xl border-t border-gray-300 bg-white shadow-2xl w-full">
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
