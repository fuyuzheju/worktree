import { useEffect, useState } from 'react';
import type { Stats } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';

export function StatsPage({ client }: { client: WorktreeClient }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .getStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <div className="rounded border border-gray-300 bg-white p-4">
      <h2 className="font-semibold">{t('stats.title')}</h2>
      {error !== null ? (
        <p className="mt-2 text-sm text-red-700">{t('stats.failed', { message: error })}</p>
      ) : stats === null ? (
        <p className="mt-2 text-sm text-gray-500">{t('stats.loading')}</p>
      ) : (
        <dl className="mt-3 grid w-80 grid-cols-2 gap-y-2 text-sm">
          <dt className="text-gray-600">{t('stats.opCount')}</dt>
          <dd className="text-right font-mono">{stats.opCount}</dd>
          <dt className="text-gray-600">{t('stats.nodeCount')}</dt>
          <dd className="text-right font-mono">{stats.nodeCount}</dd>
          <dt className="text-gray-600">{t('stats.reminderCount')}</dt>
          <dd className="text-right font-mono">{stats.reminderCount}</dd>
          <dt className="text-gray-600">{t('stats.state')}</dt>
          <dd className="text-right font-mono">{t(`stats.${stats.state}`)}</dd>
        </dl>
      )}
      <p className="mt-4 border-t border-gray-200 pt-3 text-sm text-gray-500">{t('stats.placeholder')}</p>
    </div>
  );
}
