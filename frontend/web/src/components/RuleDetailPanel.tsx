import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  civilFromDays,
  civilFromTimestamp,
  dayFromTimestamp,
  daysFromCivil,
  endOfCivilDay,
  formatCivilDate,
  occurrenceStart,
  parseCivilDate,
  weekdayFromDays,
} from '@worktree/core';
import type { BlockRule, CivilDate, CivilTime, RuleFreq } from '@worktree/core';
import type { BlockRulePatch, WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';
import type { Translate } from '../i18n';
import { CheckIcon, ClockIcon, FlagIcon, NoteIcon, PencilIcon, TrashIcon, XIcon } from './icons';

const MINUTE_MS = 60_000;
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** bySetPos value of the "every such weekday" option; the model has no 0. */
const POS_EVERY = 0;
const POS_LAST = -1;

/**
 * Create or edit a calendar rule. `rule === null` means "new rule".
 * The panel speaks the rule's own civil time (`tzOffset`), not the device's:
 * a rule stays anchored to the zone it was created in, so its occurrences
 * never move with a DST shift.
 */
export function RuleDetailPanel(props: {
  rule: BlockRule | null;
  /** Civil day of the occurrence the panel was opened from; enables "skip". */
  day?: number;
  client: WorktreeClient;
  nowMs?: number;
  /** The caller provides its own chrome (modal, bottom sheet). */
  bare?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { rule, day, client, nowMs = Date.now(), bare = false, onClose } = props;
  const tzOffset = rule?.tzOffset ?? deviceTzOffsetMs();
  const anchor: CivilDate = rule?.startDate ?? civilFromTimestamp(nowMs, tzOffset).date;
  const anchorDay = daysFromCivil(anchor.year, anchor.month, anchor.day);

  const [name, setName] = useState(rule?.name ?? '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [freq, setFreq] = useState<RuleFreq>(rule?.freq ?? 'weekly');
  const [intervalText, setIntervalText] = useState(String(rule?.interval ?? 1));
  const [startDateText, setStartDateText] = useState(formatCivilDate(anchor));
  const [timeText, setTimeText] = useState(formatCivilTime(rule?.timeOfDay ?? { hour: 9, minute: 0 }));
  const [durationText, setDurationText] = useState(String((rule?.duration ?? 60 * MINUTE_MS) / MINUTE_MS));
  const [byDay, setByDay] = useState<number[]>(rule?.byDay ?? [weekdayFromDays(anchorDay)]);
  const [nthPos, setNthPos] = useState(rule?.bySetPos ?? POS_EVERY);
  const [byMonthDayText, setByMonthDayText] = useState(
    rule?.byMonthDay !== undefined ? rule.byMonthDay.map(formatMonthDay).join(', ') : String(anchor.day),
  );
  const [byMonth, setByMonth] = useState<number[]>(rule?.byMonth ?? [anchor.month]);
  const [untilText, setUntilText] = useState(
    rule?.until !== undefined ? formatCivilDate(civilFromDays(dayFromTimestamp(rule.until, tzOffset))) : '',
  );
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const skips = rule !== null ? client.getSkips(rule.id) : [];
  const showTzHint = rule !== null && rule.tzOffset !== deviceTzOffsetMs();
  /** A monthly rule without byMonthDay repeats by weekday; empty text means that. */
  const byNthWeekday = freq === 'monthly' && byMonthDayText.trim() === '';

  const run = (fn: () => void): boolean => {
    try {
      fn();
      return true;
    } catch (e) {
      setError(t('rule.error', { message: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  };

  const save = (): void => {
    const interval = Number(intervalText);
    const startDate = parseCivilDate(startDateText);
    const time = parseCivilTime(timeText);
    const durationMs = Math.round(Number(durationText) * MINUTE_MS);
    const monthDays = parseMonthDays(byMonthDayText);
    const until = untilText.trim() === '' ? null : parseCivilDate(untilText);

    if (name === '') return setError(t('rule.nameRequired'));
    if (!Number.isInteger(interval) || interval < 1) return setError(t('rule.intervalRequired'));
    if (!Number.isFinite(durationMs) || durationMs < 1) return setError(t('rule.durationRequired'));
    if (startDate === null) return setError(t('rule.dateRequired'));
    if (time === null) return setError(t('rule.timeRequired'));
    if (untilText.trim() !== '' && until === null) return setError(t('rule.untilRequired'));
    if (freq === 'yearly' && byMonth.length === 0) return setError(t('rule.monthsRequired'));
    if ((freq === 'weekly' || byNthWeekday) && byDay.length === 0) return setError(t('rule.weekdaysRequired'));
    if (freq === 'monthly' && !byNthWeekday && monthDays === null) return setError(t('rule.monthDayRequired'));
    if (freq === 'yearly' && monthDays === null) return setError(t('rule.monthDayRequired'));

    const selectors = {
      byDay: freq === 'weekly' || byNthWeekday ? sortNumbers(byDay) : null,
      byMonthDay: freq === 'yearly' ? monthDays : freq === 'monthly' && !byNthWeekday ? monthDays : null,
      byMonth: freq === 'yearly' ? sortNumbers(byMonth) : null,
      bySetPos: byNthWeekday && nthPos !== POS_EVERY ? nthPos : null,
    };
    const untilMs =
      until !== null ? endOfCivilDay(daysFromCivil(until.year, until.month, until.day), tzOffset) : null;

    if (rule === null) {
      if (
        run(() =>
          client.addBlockRule({
            name,
            note,
            freq,
            interval,
            startDate,
            timeOfDay: time,
            duration: durationMs,
            until: untilMs ?? undefined,
            byDay: selectors.byDay ?? undefined,
            byMonthDay: selectors.byMonthDay ?? undefined,
            byMonth: selectors.byMonth ?? undefined,
            bySetPos: selectors.bySetPos ?? undefined,
          }),
        )
      ) {
        onClose();
      }
      return;
    }

    const patch: BlockRulePatch = {};
    if (name !== rule.name) patch.name = name;
    if (note !== rule.note) patch.note = note;
    if (active !== rule.active) patch.active = active;
    if (freq !== rule.freq) patch.freq = freq;
    if (interval !== rule.interval) patch.interval = interval;
    if (!sameDate(startDate, rule.startDate)) patch.startDate = startDate;
    if (time.hour !== rule.timeOfDay.hour || time.minute !== rule.timeOfDay.minute) patch.timeOfDay = time;
    if (durationMs !== rule.duration) patch.duration = durationMs;
    if (untilMs !== (rule.until ?? null)) patch.until = untilMs;
    if (!sameNumbers(rule.byDay, selectors.byDay)) patch.byDay = selectors.byDay;
    if (!sameNumbers(rule.byMonthDay, selectors.byMonthDay)) patch.byMonthDay = selectors.byMonthDay;
    if (!sameNumbers(rule.byMonth, selectors.byMonth)) patch.byMonth = selectors.byMonth;
    if ((rule.bySetPos ?? null) !== selectors.bySetPos) patch.bySetPos = selectors.bySetPos;
    // An untouched panel must not clear the rule's skips (every day-set field
    // present in the patch does), so an empty diff sends nothing at all.
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    const dropped = clearedFutureSkips(rule, skips, patch, nowMs);
    if (dropped.length > 0) {
      const days = dropped.map((d) => formatCivilDate(civilFromDays(d))).join(', ');
      if (!window.confirm(t('rule.clearSkipsConfirm', { days }))) return;
    }
    if (run(() => client.editBlockRule(rule.id, patch))) onClose();
  };

  const toggle = (values: number[], value: number): number[] =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

  const inputClass = 'mt-1 flex-1 rounded border border-gray-300 px-2 py-1 text-gray-900';
  const labelClass = 'flex items-center gap-1.5 text-sm font-semibold text-blue-600';
  const toggleClass = (on: boolean): string =>
    `rounded border px-2 py-1 text-xs ${
      on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
    }`;

  const weekdayToggles = (testIdPrefix: string): ReactNode => (
    <div className="mt-1 flex flex-wrap gap-1">
      {WEEKDAY_LABELS.map((label, i) => (
        <button
          key={label}
          type="button"
          data-testid={`${testIdPrefix}-${i}`}
          aria-pressed={byDay.includes(i)}
          onClick={() => setByDay((values) => toggle(values, i))}
          className={toggleClass(byDay.includes(i))}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="rounded border border-gray-300 bg-white p-4 pt-0 text-sm h-full overflow-auto"
      data-testid="rule-detail"
    >
      <div
        className={`flex items-center justify-between ${
          bare === true ? 'sticky top-0 z-10 -mx-4 mb-1 bg-white px-4 py-1' : ''
        }`}
      >
        <h2 className="font-semibold">{rule === null ? t('rule.newTitle') : t('rule.editTitle')}</h2>
        <button
          type="button"
          data-testid="rule-cancel"
          onClick={onClose}
          className="inline-flex items-center rounded px-3 py-1.5 text-gray-500 hover:bg-gray-100 md:px-2 md:py-0.5"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {rule !== null && (
        <div className="mt-3 flex flex-wrap gap-2">
          {day !== undefined ? (
            <button
              type="button"
              data-testid="rule-skip"
              onClick={() => run(() => client.skipOccurrence(rule.id, day))}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-amber-600 px-2 py-2 text-white hover:bg-amber-700 md:py-1"
            >
              <XIcon className="h-4 w-4" />
              {t('rule.skip')}
            </button>
          ) : (
            <p className="self-center text-xs text-gray-500">{t('rule.skipHint')}</p>
          )}
          <button
            type="button"
            data-testid="rule-delete"
            onClick={() => {
              if (window.confirm(t('rule.deleteConfirm', { name: rule.name })) && run(() => client.removeBlockRule(rule.id))) {
                onClose();
              }
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-red-600 px-2 py-2 text-white hover:bg-red-700 md:py-1"
          >
            <TrashIcon className="h-4 w-4" />
            {t('rule.delete')}
          </button>
        </div>
      )}

      {showTzHint && (
        <p data-testid="rule-tz-hint" className="mt-2 text-xs text-gray-500">
          {t('rule.tzHint', { offset: formatOffset(rule.tzOffset) })}
        </p>
      )}

      <div className="mt-3 space-y-3 text-sm">
        <label className="flex flex-col">
          <span className={labelClass}>
            <PencilIcon className="h-4 w-4" />
            {t('rule.name')}
          </span>
          <input data-testid="rule-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col">
            <span className={labelClass}>{t('rule.freq')}</span>
            <select
              data-testid="rule-freq"
              value={freq}
              onChange={(e) => setFreq(parseFreq(e.target.value))}
              className={inputClass}
            >
              <option value="daily">{t('rule.freqDaily')}</option>
              <option value="weekly">{t('rule.freqWeekly')}</option>
              <option value="monthly">{t('rule.freqMonthly')}</option>
              <option value="yearly">{t('rule.freqYearly')}</option>
            </select>
          </label>
          <label className="flex flex-col">
            <span className={labelClass}>{t('rule.interval')}</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                data-testid="rule-interval"
                type="number"
                min={1}
                step={1}
                value={intervalText}
                onChange={(e) => setIntervalText(e.target.value)}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-gray-900"
              />
              <span className="text-xs text-gray-500">{t(`rule.unit.${freq}`)}</span>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col">
            <span className={labelClass}>
              <FlagIcon className="h-4 w-4" />
              {t('rule.startDate')}
            </span>
            <input
              data-testid="rule-start-date"
              type="date"
              value={startDateText}
              onChange={(e) => setStartDateText(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col">
            <span className={labelClass}>
              <ClockIcon className="h-4 w-4" />
              {t('rule.time')}
            </span>
            <input
              data-testid="rule-time"
              type="time"
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col">
            <span className={labelClass}>{t('rule.duration')}</span>
            <input
              data-testid="rule-duration"
              type="number"
              min={1}
              step={1}
              value={durationText}
              onChange={(e) => setDurationText(e.target.value)}
              className="mt-1 w-24 rounded border border-gray-300 px-2 py-1 text-gray-900"
            />
          </label>
        </div>

        {freq === 'weekly' && (
          <div>
            <span className={labelClass}>{t('rule.weekdays')}</span>
            {weekdayToggles('rule-day')}
          </div>
        )}

        {freq === 'monthly' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  data-testid="rule-nth-mode"
                  type="checkbox"
                  checked={byNthWeekday}
                  onChange={(e) => setByMonthDayText(e.target.checked ? '' : String(anchor.day))}
                />
                {t('rule.modeNthWeekday')}
              </label>
              {byNthWeekday ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    data-testid="rule-nth"
                    value={nthPos}
                    onChange={(e) => setNthPos(Number(e.target.value))}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
                  >
                    <option value={POS_EVERY}>{t('rule.nthEvery')}</option>
                    <option value={1}>{t('rule.nth1')}</option>
                    <option value={2}>{t('rule.nth2')}</option>
                    <option value={3}>{t('rule.nth3')}</option>
                    <option value={4}>{t('rule.nth4')}</option>
                    <option value={5}>{t('rule.nth5')}</option>
                    <option value={POS_LAST}>{t('rule.nthLast')}</option>
                  </select>
                  <span className="text-xs text-gray-700">{t('rule.weekday')}</span>
                </div>
              ) : (
                <label className="flex items-center gap-2">
                  <span className="text-xs text-gray-700">{t('rule.monthDay')}</span>
                  <input
                    data-testid="rule-month-day"
                    value={byMonthDayText}
                    onChange={(e) => setByMonthDayText(e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
                  />
                </label>
              )}
            </div>
            {byNthWeekday && weekdayToggles('rule-nth-day')}
          </div>
        )}

        {freq === 'yearly' && (
          <div className="space-y-2">
            <div>
              <span className={labelClass}>{t('rule.month')}</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {monthRange().map((month) => (
                  <button
                    key={month}
                    type="button"
                    data-testid={`rule-month-${month}`}
                    aria-pressed={byMonth.includes(month)}
                    onClick={() => setByMonth((values) => toggle(values, month))}
                    className={toggleClass(byMonth.includes(month))}
                  >
                    {t(`rule.monthName${month}`)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2">
              <span className="text-xs text-gray-700">{t('rule.monthDay')}</span>
              <input
                data-testid="rule-year-day"
                value={byMonthDayText}
                onChange={(e) => setByMonthDayText(e.target.value)}
                className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
              />
            </label>
          </div>
        )}

        <label className="flex flex-col">
          <span className={labelClass}>{t('rule.until')}</span>
          <input
            data-testid="rule-until"
            type="date"
            value={untilText}
            onChange={(e) => setUntilText(e.target.value)}
            className={inputClass}
          />
          <span className="mt-0.5 text-xs text-gray-500">{t('rule.untilHint')}</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            data-testid="rule-active"
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span className="text-sm text-gray-700">{t('rule.active')}</span>
        </label>

        <label className="flex flex-col">
          <span className={labelClass}>
            <NoteIcon className="h-4 w-4" />
            {t('rule.note')}
          </span>
          <textarea
            data-testid="rule-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass}
            rows={2}
          />
        </label>

        {rule !== null && (
          <div>
            <span className={labelClass}>{t('rule.exceptions')}</span>
            {skips.length === 0 ? (
              <p className="mt-1 text-xs text-gray-500">{t('rule.noExceptions')}</p>
            ) : (
              <ul data-testid="rule-exceptions" className="mt-1 space-y-1">
                {skips.map((skippedDay) => (
                  <li key={skippedDay} className="flex items-center justify-between gap-2 text-xs">
                    <span>{formatCivilDate(civilFromDays(skippedDay))}</span>
                    <button
                      type="button"
                      data-testid={`rule-restore-${skippedDay}`}
                      onClick={() => run(() => client.unskipOccurrence(rule.id, skippedDay))}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-blue-700 hover:bg-blue-50"
                    >
                      <CheckIcon className="h-3.5 w-3.5" />
                      {t('rule.restore')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error !== null && <p className="text-xs text-red-700">{error}</p>}

        <button
          type="button"
          data-testid="rule-save"
          onClick={save}
          className="rounded border border-gray-400 bg-gray-100 px-2 py-2 font-medium text-gray-700 hover:bg-gray-200 md:py-1"
        >
          {t('rule.save')}
        </button>
      </div>
    </div>
  );
}

/** Skips a patch would clear (it touches the day set) whose occurrence is still ahead of `now`.
 *  Mirrors Calendar's day-set rule: the field's presence in the patch is what clears them. */
function clearedFutureSkips(
  rule: BlockRule,
  skips: readonly number[],
  patch: BlockRulePatch,
  now: number,
): number[] {
  const touchesDaySet =
    patch.freq !== undefined ||
    patch.interval !== undefined ||
    patch.startDate !== undefined ||
    patch.byDay !== undefined ||
    patch.byMonthDay !== undefined ||
    patch.byMonth !== undefined ||
    patch.bySetPos !== undefined ||
    patch.until !== undefined;
  return touchesDaySet ? skips.filter((day) => occurrenceStart(rule, day) > now) : [];
}

/** The device's current UTC offset in ms, whole minutes (matches the client). */
function deviceTzOffsetMs(): number {
  return Math.round((-new Date().getTimezoneOffset() * MINUTE_MS) / MINUTE_MS) * MINUTE_MS;
}

function formatOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 3_600_000))}:${pad(Math.floor(abs / MINUTE_MS) % 60)}`;
}

export function formatCivilTime(time: CivilTime): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function parseCivilTime(text: string): CivilTime | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (m === null) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** `15` or `last` (the model's -1); null when the text is not a valid entry. */
function parseMonthDays(text: string): number[] | null {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (parts.length === 0) return null;
  const days: number[] = [];
  for (const part of parts) {
    const value = part === 'last' ? -1 : Number(part);
    if (!Number.isInteger(value) || value < -1 || value === 0 || value > 31) return null;
    days.push(value);
  }
  return days;
}

export function formatMonthDay(day: number): string {
  return day === -1 ? 'last' : String(day);
}

/** One-line "Daily 09:00 · 60min" summary for the rules list. */
export function ruleSummary(rule: BlockRule, t: Translate): string {
  const parts: string[] = [t(`rule.freq${capitalize(rule.freq)}`)];
  if (rule.interval > 1) parts.push(`×${rule.interval}`);
  if (rule.byDay !== undefined) parts.push(rule.byDay.map((d) => WEEKDAY_LABELS[d] ?? String(d)).join(' '));
  if (rule.byMonthDay !== undefined) parts.push(rule.byMonthDay.map(formatMonthDay).join(', '));
  if (rule.byMonth !== undefined) parts.push(rule.byMonth.map((m) => t(`rule.monthName${m}`)).join(' '));
  if (rule.bySetPos !== undefined) parts.push(nthLabel(rule.bySetPos, t));
  parts.push(`${formatCivilTime(rule.timeOfDay)} · ${rule.duration / MINUTE_MS}min`);
  if (!rule.active) parts.push(t('rule.off'));
  return parts.join(' · ');
}

function nthLabel(pos: number, t: Translate): string {
  if (pos === -1) return t('rule.nthLast');
  if (pos >= 1 && pos <= 5) return t(`rule.nth${pos}`);
  return String(pos);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sameDate(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function sameNumbers(a: number[] | undefined, b: number[] | null): boolean {
  const left = sortNumbers(a ?? []);
  const right = sortNumbers(b ?? []);
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

function sortNumbers(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function parseFreq(value: string): RuleFreq {
  if (value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly') return value;
  throw new Error(`unknown frequency: ${value}`);
}

function monthRange(): number[] {
  const months: number[] = [];
  for (let m = 1; m <= 12; m++) months.push(m);
  return months;
}
