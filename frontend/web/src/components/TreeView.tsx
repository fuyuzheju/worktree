import type { Node } from '@worktree/core';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { rootLine } from '../render';
import { TreeNode } from './TreeNode';

export interface TreeViewProps {
  root: Node;
  expanded: Set<string>;
  selectedId: string | null;
  display: DisplayPrefs;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  /** Conflict page: rows are not selectable, expansion still works. */
  readOnly?: boolean;
}

export function TreeView(props: TreeViewProps) {
  const { t } = useI18n();
  const { root, expanded, selectedId, display, onToggle, onSelect, readOnly } = props;

  return (
    <div className="w-full px-4 font-mono text-sm leading-6" data-testid="tree-view">
      {readOnly ? (
        <div className="text-gray-700">{rootLine(root, display)}</div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect(root.id)}
          data-node-id={root.id}
          className={`whitespace-pre-wrap wrap-break-words py-1 select-none cursor-pointer text-gray-700 md:whitespace-pre md:py-0${
            selectedId === root.id ? ' ring-2 ring-inset ring-blue-400' : ''
          }`}
        >
          {rootLine(root, display)}
        </button>
      )}
      {root.children.length === 0 && (
        <div className="pl-4 text-gray-400">{t('tree.empty')}</div>
      )}
      {root.children.map((child, i) => (
        <TreeNode
          key={child.id}
          node={child}
          ancestorIsLast={[]}
          isLast={i === root.children.length - 1}
          expanded={expanded}
          selectedId={selectedId}
          display={display}
          onToggle={onToggle}
          onSelect={onSelect}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
