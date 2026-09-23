import { useMemo, useState } from 'react';
import type { Block, BlockOccurrence, Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { useIsMobile } from '../hooks/useMediaQuery';
import { findNode } from '../tree-utils';
import {
  DAY_MS,
  DEFAULT_PX_PER_HOUR,
  HOUR_GUTTER_PX,
  MIN_PX_PER_HOUR,
  blockColor,
  dayOffsetCalc,
  dayStartMs,
  dayWidthCalc,
  formatDateInput,
  formatDayHeader,
  formatHourLabel,
  isToday,
  layoutBlocks,
  parseDateInput,
} from '../calendar-utils';
import { BlockDetailPanel } from '../components/BlockDetailPanel';
import { RuleDetailPanel, ruleSummary } from '../components/RuleDetailPanel';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from '../components/icons';

/** Nominal canvas height used by layoutBlocks; the render normalizes to %. */
const DAY_PX = 24 * DEFAULT_PX_PER_HOUR;

/** What the grid draws: a real block or a derived rule occurrence. */
type GridEntry =
  | { kind: 'block'; id: string; start: number; end: number; block: Block }
  | { kind: 'occurrence'; id: string; start: number; end: number; occ: BlockOccurrence };

type Editing =
  | { mode: 'add' }
  | { mode: 'edit'; id: string }
  | { mode: 'add-rule' }
  | { mode: 'rule'; ruleId: string; day?: number };

export function CalendarPage(props: {
  client: WorktreeClient;
  tree: Node;
  display: DisplayPrefs;
  calendarDays: number;
  /** Test seam; defaults to the real clock. */
  nowMs?: number;
}) {
  const { t } = useI18n();
  const { client, tree, display, calendarDays, nowMs = Date.now() } = props;
  const isMobile = useIsMobile();
  const [anchor, setAnchor] = useState<number>(() => dayStartMs(nowMs));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const blocks = client.getBlocks();
  const rules = client.getRules();
  // Blocks and occurrences share one lane pool, so a rule never hides a block.
  const entries = useMemo(() => {
    const blockEntries: GridEntry[] = blocks.map((block) => ({
      kind: 'block',
      id: block.id,
      start: block.start,
      end: block.end,
      block,
    }));
    const occurrenceEntries: GridEntry[] = client
      .expandOccurrences(anchor, anchor + calendarDays * DAY_MS)
      .map((occ) => ({ kind: 'occurrence', id: occ.id, start: occ.occStart, end: occ.occEnd, occ }));
    return [...blockEntries, ...occurrenceEntries];
  }, [blocks, client, anchor, calendarDays]);
  const bars = useMemo(() => layoutBlocks(entries, anchor, calendarDays), [entries, anchor, calendarDays]);
  const days = useMemo(
    () => Array.from({ length: calendarDays }, (_, i) => anchor + i * DAY_MS),
    [anchor, calendarDays],
  );

  const editBlock = editing?.mode === 'edit' ? (blocks.find((b) => b.id === editing.id) ?? null) : null;
  const editRule =
    editing?.mode === 'rule' ? (rules.find((r) => r.id === editing.ruleId) ?? null) : null;
  const editRuleDay = editing?.mode === 'rule' ? editing.day : undefined;

  const nav = (delta: number): void => setAnchor((a) => a + delta * DAY_MS);

  const detailPanel =
    editBlock !== null ? (
      <BlockDetailPanel
        key={editBlock.id}
        bare
        block={editBlock}
        client={client}
        tree={tree}
        display={display}
        nowMs={nowMs}
        onClose={() => setEditing(null)}
      />
    ) : editRule !== null ? (
      <RuleDetailPanel
        key={editRule.id}
        bare
        rule={editRule}
        day={editRuleDay}
        client={client}
        nowMs={nowMs}
        onClose={() => setEditing(null)}
      />
    ) : null;

  return (
    <div className={`flex w-full flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col min-h-0 max-w-[700px] mx-auto">
        <div className="flex items-center gap-2 pb-2 flex-wrap ml-2 mr-2">
          <button
            type="button"
            data-testid="calendar-prev"
            onClick={() => nav(-1)}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            {isMobile ? '' : t('calendar.prev')}
          </button>
          <button
            type="button"
            data-testid="calendar-today"
            onClick={() => setAnchor(dayStartMs(nowMs))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {t('calendar.today')}
          </button>
          <button
            type="button"
            data-testid="calendar-next"
            onClick={() => nav(1)}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {isMobile ? '' : t('calendar.next')}
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
          <input
            type="date"
            data-testid="calendar-date"
            aria-label={t('calendar.jumpToDay')}
            value={formatDateInput(anchor)}
            onChange={(e) => {
              const ms = parseDateInput(e.target.value);
              if (ms !== null) setAnchor(ms);
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
          />
          <div className="flex-1" />
          <button
            type="button"
            data-testid="calendar-rules"
            onClick={() => {
              setEditing(null);
              setRulesOpen(true);
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {t('rule.listTitle')}
          </button>
          <button
            type="button"
            data-testid="calendar-add-rule"
            onClick={() => setEditing({ mode: 'add-rule' })}
            className="rounded bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-700"
          >
            + {t('rule.add')}
          </button>
          <button
            type="button"
            data-testid="calendar-add"
            onClick={() => setEditing({ mode: 'add' })}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            + {t('calendar.add')}
          </button>
        </div>

        <div className="flex w-full">
          <div style={{ width: HOUR_GUTTER_PX }} />
          {days.map((d) => (
            <div
              key={d}
              className={`flex-1 text-center text-xs py-1 ${isToday(d, nowMs) ? 'font-semibold text-blue-700' : 'text-gray-600'}`}
            >
              {formatDayHeader(d)}
            </div>
          ))}
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto rounded border border-gray-300 bg-white">
          {/* The canvas fills the available space, but hour rows never shrink
              below MIN_PX_PER_HOUR — the day scrolls when the space is short.
              The day columns share the width evenly (fewer days → wider). */}
          <div className="relative h-full w-full" style={{ minHeight: 24 * MIN_PX_PER_HOUR }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h}>
                <div
                  className={`absolute left-0 right-0 border-t ${h === 0 ? 'border-gray-400' : 'border-gray-200'}`}
                  style={{ top: `${(h / 24) * 100}%` }}
                />
                <div
                  className="absolute translate-y-[2px] pr-1 text-right text-[10px] leading-none text-gray-400"
                  style={{ top: `${(h / 24) * 100}%`, left: 0, width: HOUR_GUTTER_PX - 4 }}
                >
                  {formatHourLabel(h)}
                </div>
              </div>
            ))}
            {days.slice(1).map((d, i) => (
              <div
                key={d}
                className="absolute top-0 bottom-0 w-0.5 bg-gray-300"
                style={{ left: dayOffsetCalc((i + 1) / calendarDays) }}
              />
            ))}
            {days.map((d, i) =>
              isToday(d, nowMs) ? (
                <div
                  key={d}
                  className="absolute top-0 bottom-0 bg-blue-50/60"
                  style={{ left: dayOffsetCalc(i / calendarDays), width: dayWidthCalc(1 / calendarDays) }}
                />
              ) : null,
            )}
            {bars.map((bar) => {
              const entry = bar.item;
              const geometry = {
                top: `${(bar.topPx / DAY_PX) * 100}%`,
                height: `${(bar.heightPx / DAY_PX) * 100}%`,
                // Each lane occupies 1/lanes of the day column; the old
                // `1 - lane/lanes` width made lane 0 span the whole column.
                left: dayOffsetCalc((bar.dayIndex + bar.lane / bar.lanes) / calendarDays),
                width: dayWidthCalc(1 / bar.lanes / calendarDays),
              };
              const base = 'absolute overflow-hidden rounded p-1 text-left text-white min-h-[14px] hover:brightness-95';
              if (entry.kind === 'block') {
                const linked = entry.block.nodeId !== undefined ? findNode(tree, entry.block.nodeId) : undefined;
                const selected = editing?.mode === 'edit' && editing.id === bar.id;
                return (
                  <button
                    key={`${bar.id}#${bar.dayIndex}`}
                    type="button"
                    data-testid={`block-${bar.id}`}
                    onClick={() => setEditing({ mode: 'edit', id: bar.id })}
                    title={entry.block.name + (linked ? ` · ${linked.name}` : '')}
                    className={`${base} ${selected ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                    style={{
                      ...geometry,
                      backgroundColor: blockColor(bar.id),
                      opacity: entry.block.status ? 0.5 : undefined,
                    }}
                  >
                    <span className="block truncate text-xs">{entry.block.name}</span>
                    {linked !== undefined && (
                      <span className="block truncate text-[10px] opacity-80">{linked.name}</span>
                    )}
                  </button>
                );
              }
              const selected =
                editing?.mode === 'rule' &&
                editing.ruleId === entry.occ.ruleId &&
                editing.day === entry.occ.day;
              return (
                <button
                  key={`${bar.id}#${bar.dayIndex}`}
                  type="button"
                  data-testid={`occurrence-${bar.id}`}
                  onClick={() => setEditing({ mode: 'rule', ruleId: entry.occ.ruleId, day: entry.occ.day })}
                  title={entry.occ.name}
                  className={`${base} ${selected ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                  style={{ ...geometry, backgroundColor: blockColor(entry.occ.ruleId) }}
                >
                  <span className="block truncate text-xs">{entry.occ.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isMobile ? (
        detailPanel !== null && (
          <div className="max-h-[55vh] min-h-[55vh] w-full overflow-y-auto rounded-t-2xl border-t border-gray-300 bg-white shadow-2xl">
            {detailPanel}
          </div>
        )
      ) : (
        <div className="w-96 shrink-0">
          {detailPanel ?? (
            <div className="rounded border border-gray-300 bg-white p-4 text-sm text-gray-500">
              {t('calendar.hint')}
            </div>
          )}
        </div>
      )}

      {editing?.mode === 'add' && (
        <div
          data-testid="block-modal"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-lg border border-gray-300 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <BlockDetailPanel
              bare
              block={null}
              client={client}
              tree={tree}
              display={display}
              nowMs={nowMs}
              onClose={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {editing?.mode === 'add-rule' && (
        <div
          data-testid="rule-modal"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-lg border border-gray-300 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <RuleDetailPanel bare rule={null} client={client} nowMs={nowMs} onClose={() => setEditing(null)} />
          </div>
        </div>
      )}

      {rulesOpen && (
        <div
          data-testid="rule-list-modal"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setRulesOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-lg border border-gray-300 bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('rule.listTitle')}</h2>
              <button
                type="button"
                data-testid="rule-list-close"
                onClick={() => setRulesOpen(false)}
                className="inline-flex items-center rounded px-3 py-1.5 text-gray-500 hover:bg-gray-100 md:px-2 md:py-0.5"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {rules.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">{t('rule.listEmpty')}</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {rules.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      data-testid={`rule-list-${r.id}`}
                      onClick={() => {
                        setRulesOpen(false);
                        setEditing({ mode: 'rule', ruleId: r.id });
                      }}
                      className="w-full rounded border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="block text-sm text-gray-900">
                        {r.name}
                        {r.active ? '' : ` · ${t('rule.off')}`}
                      </span>
                      <span className="block truncate text-xs text-gray-500">{ruleSummary(r, t)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
