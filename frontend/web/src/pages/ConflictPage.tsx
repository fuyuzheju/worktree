import { useMemo, useState } from 'react';
import { Tree, filterTree } from '@worktree/core';
import type { Node, TreeOperation } from '@worktree/core';
import type { Conflict, WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { TreeView } from '../components/TreeView';
import { filterReplayable, formatHistoryNode, formatHistoryOp } from '../conflict-utils';

function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function replay(ops: TreeOperation[]): Node {
  try {
    return Tree.fromOps(ops).getRoot();
  } catch {
    // Should not happen: confirmed is the shared prefix and serverBranch its
    // suffix. Fall back to an empty tree rather than crashing the page.
    return Tree.fromOps([]).getRoot();
  }
}

export function ConflictPage(props: {
  conflict: Conflict;
  client: WorktreeClient;
  display: DisplayPrefs;
}) {
  const { t } = useI18n();
  const { conflict, client, display } = props;
  const [serverExpanded, setServerExpanded] = useState<Set<string>>(new Set());
  const [localExpanded, setLocalExpanded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<null | 'server' | 'local'>(null);
  const [error, setError] = useState<string | null>(null);

  const serverTree = useMemo(
    () => replay([...client.getConfirmed(), ...conflict.serverBranch].map((n) => n.op)),
    [client, conflict],
  );
  const localTree = client.getTree();

  const resolve = async (choice: 'server' | 'local'): Promise<void> => {
    setResolving(choice);
    setError(null);
    try {
      if (choice === 'local') {
        // Keep the pending ops that still replay on the server history and
        // rewrite with those; drop the ones that conflict. If nothing
        // survives, adopting the server history is the same as keep-server.
        const chosen = filterReplayable(
          [...client.getConfirmed(), ...conflict.serverBranch],
          conflict.localBranch,
        );
        await client.resolveConflict(chosen.length > 0 ? 'local' : 'server', chosen);
      } else {
        await client.resolveConflict('server');
      }
      // On success the kernel clears the conflict and emits; App unmounts us.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResolving(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 text-gray-900 md:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-xl font-bold">{t('conflict.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('conflict.explanation')}</p>
        <p className="mt-1 font-mono text-xs text-gray-500">
          {t('conflict.base', { base: conflict.baseId ?? '∅' })}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border border-gray-300 bg-white p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('conflict.serverVersion')}</h2>
              <span className="text-xs text-gray-500">
                {t('conflict.newOps', { n: conflict.serverBranch.length })}
              </span>
            </div>
            {conflict.serverBranch.length > 0 && (
              <ul className="mt-1 font-mono text-xs text-gray-500">
                {conflict.serverBranch.map((n) => (
                  <li key={n.id}>{formatHistoryNode(n)}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 max-h-[50vh] overflow-auto">
              <TreeView
                root={filterTree(serverTree, {})}
                expanded={serverExpanded}
                selectedId={null}
                display={display}
                onToggle={(id) => setServerExpanded((s) => toggleIn(s, id))}
                onSelect={() => undefined}
                readOnly
              />
            </div>
          </div>
          <div className="rounded border border-gray-300 bg-white p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('conflict.yourVersion')}</h2>
              <span className="text-xs text-gray-500">
                {t('conflict.pendingOps', { n: conflict.localBranch.length })}
              </span>
            </div>
            {conflict.localBranch.length > 0 && (
              <ul className="mt-1 font-mono text-xs text-gray-500">
                {conflict.localBranch.map((h) => (
                  <li key={h.id}>{formatHistoryOp(h)}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 max-h-[50vh] overflow-auto">
              <TreeView
                root={filterTree(localTree, {})}
                expanded={localExpanded}
                selectedId={null}
                display={display}
                onToggle={(id) => setLocalExpanded((s) => toggleIn(s, id))}
                onSelect={() => undefined}
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={resolving !== null}
            onClick={() => void resolve('server')}
            data-testid="conflict-keep-server"
            className="w-full rounded bg-blue-600 px-4 py-2.5 text-white hover:bg-blue-700 disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {resolving === 'server' ? t('conflict.resolving') : t('conflict.keepServer')}
          </button>
          <button
            type="button"
            disabled={resolving !== null}
            onClick={() => void resolve('local')}
            data-testid="conflict-keep-local"
            className="w-full rounded bg-green-600 px-4 py-2.5 text-white hover:bg-green-700 disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {resolving === 'local' ? t('conflict.resolving') : t('conflict.keepLocal')}
          </button>
        </div>
        {error !== null && (
          <div className="mt-3 text-sm text-red-700">{t('conflict.error', { message: error })}</div>
        )}
      </div>
    </div>
  );
}
