import { useEffect, useState } from 'react';
import { computeStats } from '@worktree/core';
import type { Block, Node } from '@worktree/core';
import { useI18n } from '../i18n';

/** Re-render once a minute so time-based stats (overdue, missed) stay live. */
const REFRESH_MS = 60_000;

function pct(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

export function StatsPage({ tree, blocks }: { tree: Node; blocks: Block[] }) {
  const { t } = useI18n();
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);
  const stats = computeStats(tree, blocks, Date.now());

  const Row = ({ label, value }: { label: string; value: string }) => (
    <>
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </>
  );

  return (
    <div className="rounded border border-gray-300 bg-white p-4">
      <h2 className="font-semibold">{t('stats.title')}</h2>

      <h3 className="mt-4 border-b border-gray-200 pb-1 text-sm font-medium text-gray-700">{t('stats.nodesHeading')}</h3>
      <dl className="mt-2 grid w-full max-w-80 grid-cols-2 gap-y-2 text-sm">
        <Row label={t('stats.completed')} value={String(stats.nodes.completed)} />
        <Row label={t('stats.incomplete')} value={String(stats.nodes.incomplete)} />
        <Row label={t('stats.total')} value={String(stats.nodes.total)} />
        <Row label={t('stats.completionRatio')} value={pct(stats.nodes.completionRatio)} />
      </dl>

      <h3 className="mt-4 border-b border-gray-200 pb-1 text-sm font-medium text-gray-700">{t('stats.remindersHeading')}</h3>
      <dl className="mt-2 grid w-full max-w-80 grid-cols-2 gap-y-2 text-sm">
        <Row label={t('stats.total')} value={String(stats.reminders.total)} />
        <Row label={t('stats.remindersActive')} value={String(stats.reminders.active)} />
        <Row label={t('stats.remindersMissed')} value={String(stats.reminders.missed)} />
      </dl>

      <h3 className="mt-4 border-b border-gray-200 pb-1 text-sm font-medium text-gray-700">{t('stats.blocksHeading')}</h3>
      <dl className="mt-2 grid w-full max-w-80 grid-cols-2 gap-y-2 text-sm">
        <Row label={t('stats.total')} value={String(stats.blocks.total)} />
        <Row label={t('stats.completed')} value={String(stats.blocks.completed)} />
        <Row label={t('stats.completionRatio')} value={pct(stats.blocks.completionRatio)} />
        <Row label={t('stats.blocksLinked')} value={String(stats.blocks.linked)} />
        <Row label={t('stats.blocksUpcoming7d')} value={`${Math.round(stats.blocks.upcoming7dHours)}h`} />
      </dl>

      <h3 className="mt-4 border-b border-gray-200 pb-1 text-sm font-medium text-gray-700">{t('stats.timingHeading')}</h3>
      <dl className="mt-2 grid w-full max-w-80 grid-cols-2 gap-y-2 text-sm">
        <Row label={t('stats.completionBuffer')} value={pct(stats.timing.completionBufferRatio)} />
        <Row label={t('stats.blockBuffer')} value={pct(stats.timing.blockBufferRatio)} />
        <Row label={t('stats.overdueIncomplete')} value={String(stats.timing.overdueIncomplete)} />
        <Row label={t('stats.lateCompletionRatio')} value={pct(stats.timing.lateCompletionRatio)} />
        <Row label={t('stats.completed7d')} value={String(stats.timing.completed7d)} />
        <Row label={t('stats.completed30d')} value={String(stats.timing.completed30d)} />
        <Row label={t('stats.avgIncompleteAge')} value={fmtDays(stats.timing.avgIncompleteAgeDays)} />
        <Row label={t('stats.oldestIncomplete')} value={fmtDays(stats.timing.oldestIncompleteDays)} />
      </dl>
    </div>
  );
}

function fmtDays(days: number | null): string {
  return days === null ? '—' : `${Math.round(days)}d`;
}
