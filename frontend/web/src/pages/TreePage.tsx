import { useEffect, useState } from 'react';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
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

  const selected = selectedId !== null ? findNode(tree, selectedId) : undefined;

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <div className="max-h-[70vh] overflow-auto rounded border border-gray-300 bg-white p-3">
          <TreeView
            root={tree}
            expanded={expanded}
            selectedId={selectedId}
            display={display}
            onToggle={toggle}
            onSelect={select}
          />
        </div>
      </div>
      <div className="w-96 shrink-0">
        {selected ? (
          <NodeDetailPanel node={selected} client={client} onClose={() => setSelectedId(null)} />
        ) : (
          <div className="rounded border border-gray-300 bg-white p-4 text-sm text-gray-500">
            {t('tree.selectHint')}
          </div>
        )}
      </div>
    </div>
  );
}
