import { useCallback, useEffect, useState } from 'react';
import type { RepairDrop } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';

/**
 * Shown when the confirmed history no longer replays (entries stored before
 * a validation rule existed). The only repair is dropping those entries, so
 * the page lists exactly what would be removed and requires confirmation.
 */
export function RepairPage(props: { client: WorktreeClient }) {
  const { t } = useI18n();
  const { client } = props;
  const [drops, setDrops] = useState<RepairDrop[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const plan = useCallback(async (): Promise<void> => {
    setDrops(null);
    setLoadError(null);
    try {
      setDrops(await client.planRepair());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);

  useEffect(() => {
    void plan();
  }, [plan]);

  const apply = async (): Promise<void> => {
    setApplying(true);
    setApplyError(null);
    try {
      await client.repairHistory();
      // On success the kernel clears the failure and emits; App unmounts us.
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
      setApplying(false);
      // The plan may have changed (e.g. the server history advanced): re-read it.
      void plan();
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 text-gray-900 md:p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold">{t('repair.title')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('repair.explanation')}</p>

        {loadError !== null && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p>{t('repair.loadError', { message: loadError })}</p>
            <button
              type="button"
              onClick={() => void plan()}
              className="mt-2 rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800"
            >
              {t('repair.retry')}
            </button>
          </div>
        )}

        {drops === null && loadError === null && (
          <p className="mt-4 text-sm text-gray-500">{t('repair.loading')}</p>
        )}

        {drops !== null && drops.length === 0 && (
          <div className="mt-4 rounded border border-gray-300 bg-white px-4 py-3 text-sm">
            <p>{t('repair.nothing')}</p>
            <button
              type="button"
              onClick={() => void plan()}
              className="mt-2 rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              {t('repair.retry')}
            </button>
          </div>
        )}

        {drops !== null && drops.length > 0 && (
          <>
            <div className="mt-4 rounded border border-gray-300 bg-white p-4">
              <h2 className="font-semibold">{t('repair.entries', { n: drops.length })}</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {drops.map((drop) => (
                  <li key={drop.entry.id} className="rounded bg-gray-50 px-3 py-2">
                    <p className="text-sm font-medium">{drop.description}</p>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">
                      {drop.entry.id} — {drop.reason}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-amber-800">{t('repair.warning')}</p>
            </div>

            <button
              type="button"
              disabled={applying}
              onClick={() => void apply()}
              data-testid="repair-apply"
              className="mt-4 w-full rounded bg-amber-600 px-4 py-2.5 text-white hover:bg-amber-700 disabled:opacity-40 sm:w-auto sm:py-2"
            >
              {applying ? t('repair.applying') : t('repair.apply')}
            </button>
            {applyError !== null && (
              <div className="mt-3 text-sm text-red-700">{t('repair.error', { message: applyError })}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
