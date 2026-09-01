import { useMemo, useState } from 'react';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { DisplayPrefs } from '../config';
import { useI18n } from '../i18n';
import { useIsMobile } from '../hooks/useMediaQuery';
import { findNode } from '../tree-utils';
import {
  DAY_MS,
  DEFAULT_PX_PER_HOUR,
  HOUR_GUTTER_PX,
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

/** Nominal canvas height used by layoutBlocks; the render normalizes to %. */
const DAY_PX = 24 * DEFAULT_PX_PER_HOUR;

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
  const [editing, setEditing] = useState<null | { mode: 'add' } | { mode: 'edit'; id: string }>(null);

  const blocks = client.getBlocks();
  const bars = useMemo(() => layoutBlocks(blocks, anchor, calendarDays), [blocks, anchor, calendarDays]);
  const days = useMemo(
    () => Array.from({ length: calendarDays }, (_, i) => anchor + i * DAY_MS),
    [anchor, calendarDays],
  );

  const editBlock = editing?.mode === 'edit' ? (blocks.find((b) => b.id === editing.id) ?? null) : null;
  // The side panel (or bottom sheet) edits existing blocks only; adding a
  // block is a centered modal instead.
  const showPanel = editBlock !== null;

  const nav = (delta: number): void => setAnchor((a) => a + delta * DAY_MS);

  const addBlock = (): void => setEditing({ mode: 'add' });

  return (
    <div className={`flex w-full flex-1 min-h-0 ${isMobile ? 'flex-col' : ''}`}>
      <div className="flex min-w-0 flex-1 flex-col min-h-0 max-w-[700px] mx-auto">
        <div className="flex items-center gap-2 pb-2">
          <button
            type="button"
            data-testid="calendar-prev"
            onClick={() => nav(-1)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            ‹ {t('calendar.prev')}
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
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            {t('calendar.next')} ›
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
            data-testid="calendar-add"
            onClick={addBlock}
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

        <div className="relative flex-1 min-h-0 overflow-hidden rounded border border-gray-300 bg-white">
          {/* The canvas fills the available space: 24h maps to 100% of the
              height and the day columns share the width evenly (fewer days →
              wider columns), so no scrollbar is needed. */}
          <div className="relative h-full w-full">
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
              const linked = bar.block.nodeId !== undefined ? findNode(tree, bar.block.nodeId) : undefined;
              return (
                <button
                  key={`${bar.id}#${bar.dayIndex}`}
                  type="button"
                  data-testid={`block-${bar.id}`}
                  onClick={() => setEditing({ mode: 'edit', id: bar.id })}
                  title={bar.block.name + (linked ? ` · ${linked.name}` : '')}
                  className={`absolute overflow-hidden rounded p-1 text-left text-white min-h-[14px] ${
                    bar.block.status ? '' : 'hover:brightness-95'
                  } ${
                    editing?.mode === 'edit' && editing.id === bar.id
                      ? 'ring-2 ring-inset ring-blue-300'
                      : ''
                  }`}
                  style={{
                    backgroundColor: blockColor(bar.id),
                    opacity: bar.block.status ? 0.5 : undefined,
                    top: `${(bar.topPx / DAY_PX) * 100}%`,
                    height: `${(bar.heightPx / DAY_PX) * 100}%`,
                    left: dayOffsetCalc((bar.dayIndex + bar.lane / bar.lanes) / calendarDays),
                    width: dayWidthCalc((1 - bar.lane / bar.lanes) / calendarDays),
                  }}
                >
                  <span className="block truncate text-xs">{bar.block.name}</span>
                  {linked !== undefined && (
                    <span className="block truncate text-[10px] opacity-80">{linked.name}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isMobile ? (
        showPanel && (
          <div className="max-h-[55vh] min-h-[55vh] w-full overflow-y-auto rounded-t-2xl border-t border-gray-300 bg-white shadow-2xl">
            <BlockDetailPanel
              key={editBlock!.id}
              bare
              block={editBlock}
              client={client}
              tree={tree}
              display={display}
              nowMs={nowMs}
              onClose={() => setEditing(null)}
            />
          </div>
        )
      ) : (
        <div className="w-96 shrink-0">
          {showPanel ? (
            <BlockDetailPanel
              key={editBlock!.id}
              block={editBlock}
              client={client}
              tree={tree}
              display={display}
              nowMs={nowMs}
              onClose={() => setEditing(null)}
            />
          ) : (
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
    </div>
  );
}
