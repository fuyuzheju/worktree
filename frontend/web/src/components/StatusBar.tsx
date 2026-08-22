import { useState } from 'react';
import type { WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';

export function StatusBar(props: {
  online: boolean;
  pendingCount: number;
  client: WorktreeClient;
}) {
  const { t } = useI18n();
  const { online, pendingCount, client } = props;
  const [syncing, setSyncing] = useState(false);

  const onSync = async (): Promise<void> => {
    if (syncing) return;
    setSyncing(true);
    try {
      await client.sync();
    } catch (e) {
      console.error('sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
          aria-hidden
        />
        <span className="text-gray-600">{online ? t('status.online') : t('status.offline')}</span>
      </span>
      {pendingCount > 0 && (
        <span className="text-amber-700">{t('status.pending', { n: pendingCount })}</span>
      )}
      <button
        type="button"
        onClick={() => void onSync()}
        disabled={syncing || client.isLocal()}
        data-testid="status-sync"
        className="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
      >
        {syncing ? t('status.syncing') : t('status.sync')}
      </button>
    </div>
  );
}
