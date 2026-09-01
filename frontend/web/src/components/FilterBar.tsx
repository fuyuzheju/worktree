import { useState } from 'react';
import type { NodeFilter } from '@worktree/core';
import { hasActiveFilter } from '@worktree/core';
import type { FilterDisplayMode } from '../config';
import { useI18n } from '../i18n';
import { epochToLocalInput, localInputToEpoch } from '../time';
import { ChevronDownIcon, ChevronUpIcon, FilterIcon } from './icons';

export interface FilterBarProps {
  filter: NodeFilter;
  mode: FilterDisplayMode;
  onFilterChange: (filter: NodeFilter) => void;
  onModeChange: (mode: FilterDisplayMode) => void;
}

/** A floating button with an absolutely-positioned dropdown — takes no layout space. */
export function FilterBar(props: FilterBarProps) {
  const { t } = useI18n();
  const { filter, mode, onFilterChange, onModeChange } = props;
  const [open, setOpen] = useState(false);
  const active = hasActiveFilter(filter);

  const set = (patch: Partial<NodeFilter>): void => {
    onFilterChange({ ...filter, ...patch });
  };

  const setDatetime = (key: 'deadlineBefore' | 'createdAfter' | 'createdBefore', value: string): void => {
    const ms = localInputToEpoch(value);
    set({ [key]: ms ?? undefined });
  };

  const clear = (): void => onFilterChange({});

  return (
    <div className="relative" data-testid="filter-bar">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        data-testid="filter-toggle"
        className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-mono text-xs hover:bg-gray-50 ${
          active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 bg-white'
        }`}
      >
        <FilterIcon className="h-3.5 w-3.5" />
        {t('filter.title')}
        {open ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-72 rounded border border-gray-300 bg-white p-3 font-mono text-xs shadow-lg">
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t('filter.keyword')}</span>
              <input
                type="text"
                value={filter.keyword ?? ''}
                onChange={(e) => set({ keyword: e.target.value === '' ? undefined : e.target.value })}
                placeholder={t('filter.keywordPlaceholder')}
                data-testid="filter-keyword"
                className="w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t('filter.status')}</span>
              <select
                value={filter.status === undefined ? '' : String(filter.status)}
                onChange={(e) =>
                  set({ status: e.target.value === '' ? undefined : e.target.value === 'true' })
                }
                data-testid="filter-status"
                className="w-full rounded border border-gray-300 px-1 py-0.5"
              >
                <option value="">{t('filter.statusAll')}</option>
                <option value="false">{t('filter.statusUncompleted')}</option>
                <option value="true">{t('filter.statusCompleted')}</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={filter.overdue === true}
                onChange={(e) => set({ overdue: e.target.checked ? true : undefined })}
                data-testid="filter-overdue"
              />
              {t('filter.overdue')}
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t('filter.deadlineBefore')}</span>
              <input
                type="datetime-local"
                step={1}
                value={filter.deadlineBefore !== undefined ? epochToLocalInput(filter.deadlineBefore) : ''}
                onChange={(e) => setDatetime('deadlineBefore', e.target.value)}
                data-testid="filter-deadline-before"
                className="w-full rounded border border-gray-300 px-1 py-0.5"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t('filter.createdAfter')}</span>
              <input
                type="datetime-local"
                step={1}
                value={filter.createdAfter !== undefined ? epochToLocalInput(filter.createdAfter) : ''}
                onChange={(e) => setDatetime('createdAfter', e.target.value)}
                data-testid="filter-created-after"
                className="w-full rounded border border-gray-300 px-1 py-0.5"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t('filter.createdBefore')}</span>
              <input
                type="datetime-local"
                step={1}
                value={filter.createdBefore !== undefined ? epochToLocalInput(filter.createdBefore) : ''}
                onChange={(e) => setDatetime('createdBefore', e.target.value)}
                data-testid="filter-created-before"
                className="w-full rounded border border-gray-300 px-1 py-0.5"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-600">{t('filter.mode')}</span>
              <select
                value={mode}
                onChange={(e) => onModeChange(e.target.value === 'highlight' ? 'highlight' : 'hide')}
                data-testid="filter-mode"
                className="w-full rounded border border-gray-300 px-1 py-0.5"
              >
                <option value="hide">{t('filter.hide')}</option>
                <option value="highlight">{t('filter.highlight')}</option>
              </select>
            </label>
            {active && (
              <button
                type="button"
                onClick={clear}
                data-testid="filter-clear"
                className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-50"
              >
                {t('filter.clear')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
