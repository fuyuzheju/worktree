import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { daysFromCivil } from '@worktree/core';
import type { BlockRule } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { RuleDetailPanel } from '../src/components/RuleDetailPanel';

// Thu Jan 15 2026, 10:00 local — DST-free reference.
const NOW = new Date(2026, 0, 15, 10, 0).getTime();
const DEVICE_TZ = -new Date(2026, 0, 15).getTimezoneOffset() * 60_000;

/** Mirrors the panel's offset rendering. */
function formatOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `UTC${sign}${pad(Math.floor(abs / 3_600_000))}:${pad(Math.floor(abs / 60_000) % 60)}`;
}

const ruleOf = (over: Partial<BlockRule> = {}): BlockRule => ({
  id: 'r1',
  name: 'standup',
  note: '',
  freq: 'weekly',
  interval: 1,
  startDate: { year: 2026, month: 1, day: 12 },
  timeOfDay: { hour: 9, minute: 0 },
  duration: 3_600_000,
  byDay: [1],
  tzOffset: DEVICE_TZ,
  active: true,
  ...over,
});

type FakeClient = WorktreeClient & {
  addBlockRule: ReturnType<typeof vi.fn>;
  editBlockRule: ReturnType<typeof vi.fn>;
  removeBlockRule: ReturnType<typeof vi.fn>;
  skipOccurrence: ReturnType<typeof vi.fn>;
  unskipOccurrence: ReturnType<typeof vi.fn>;
  getSkips: ReturnType<typeof vi.fn>;
};

function makeClient(skips: number[] = []): FakeClient {
  return {
    getSkips: vi.fn(() => skips),
    addBlockRule: vi.fn(),
    editBlockRule: vi.fn(),
    removeBlockRule: vi.fn(),
    skipOccurrence: vi.fn(),
    unskipOccurrence: vi.fn(),
  } as unknown as FakeClient;
}

function renderPanel(client: FakeClient, rule: BlockRule | null, day?: number): void {
  render(
    <I18nProvider lang="en">
      <RuleDetailPanel rule={rule} day={day} client={client} nowMs={NOW} onClose={() => undefined} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RuleDetailPanel creation', () => {
  it('creates a weekly rule with the picked weekdays', () => {
    const client = makeClient();
    renderPanel(client, null);
    fireEvent.change(screen.getByTestId('rule-name'), { target: { value: 'standup' } });
    fireEvent.change(screen.getByTestId('rule-time'), { target: { value: '10:30' } });
    fireEvent.change(screen.getByTestId('rule-duration'), { target: { value: '90' } });
    // Today (Jan 15 2026) is a Thursday and is the default anchor day.
    fireEvent.click(screen.getByTestId('rule-day-3'));
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.addBlockRule).toHaveBeenCalledWith({
      name: 'standup',
      note: '',
      freq: 'weekly',
      interval: 1,
      startDate: { year: 2026, month: 1, day: 15 },
      timeOfDay: { hour: 10, minute: 30 },
      duration: 90 * 60_000,
      until: undefined,
      byDay: [3, 4],
      byMonthDay: undefined,
      byMonth: undefined,
      bySetPos: undefined,
    });
  });

  it('creates a monthly rule on a fixed day, and understands "last"', () => {
    const client = makeClient();
    renderPanel(client, null);
    fireEvent.change(screen.getByTestId('rule-name'), { target: { value: 'rent' } });
    fireEvent.change(screen.getByTestId('rule-freq'), { target: { value: 'monthly' } });
    fireEvent.change(screen.getByTestId('rule-month-day'), { target: { value: 'last' } });
    fireEvent.change(screen.getByTestId('rule-until'), { target: { value: '2026-06-30' } });
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.addBlockRule).toHaveBeenCalledWith(
      expect.objectContaining({
        freq: 'monthly',
        byMonthDay: [-1],
        byDay: undefined,
        bySetPos: undefined,
        // The until date covers that whole civil day (endOfCivilDay).
        until: daysFromCivil(2026, 6, 30) * 86_400_000 - DEVICE_TZ + 86_400_000 - 1,
      }),
    );
  });

  it('creates a monthly nth-weekday rule without a month day', () => {
    const client = makeClient();
    renderPanel(client, null);
    fireEvent.change(screen.getByTestId('rule-name'), { target: { value: 'review' } });
    fireEvent.change(screen.getByTestId('rule-freq'), { target: { value: 'monthly' } });
    fireEvent.click(screen.getByTestId('rule-nth-mode'));
    fireEvent.change(screen.getByTestId('rule-nth'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('rule-nth-day-0')); // Sunday, next to the anchor's Thursday
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.addBlockRule).toHaveBeenCalledWith(
      expect.objectContaining({ freq: 'monthly', byMonthDay: undefined, byDay: [0, 4], bySetPos: 2 }),
    );
  });

  it('rejects an empty name before calling the client', () => {
    const client = makeClient();
    renderPanel(client, null);
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.addBlockRule).not.toHaveBeenCalled();
    expect(screen.getByText(/Name is required/)).toBeInTheDocument();
  });
});

describe('RuleDetailPanel editing', () => {
  it('sends only the renamed field, so the exceptions survive', () => {
    const client = makeClient([daysFromCivil(2026, 1, 19)]);
    renderPanel(client, ruleOf());
    fireEvent.change(screen.getByTestId('rule-name'), { target: { value: 'renamed' } });
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.editBlockRule).toHaveBeenCalledWith('r1', { name: 'renamed' });
  });

  it('sends a time tweak without touching the day set', () => {
    const client = makeClient();
    renderPanel(client, ruleOf());
    fireEvent.change(screen.getByTestId('rule-time'), { target: { value: '11:00' } });
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.editBlockRule).toHaveBeenCalledWith('r1', { timeOfDay: { hour: 11, minute: 0 } });
  });

  it('switches a monthly rule from a fixed day to an nth weekday', () => {
    const client = makeClient();
    renderPanel(client, ruleOf({ freq: 'monthly', byDay: undefined, byMonthDay: [15] }));
    fireEvent.click(screen.getByTestId('rule-nth-mode'));
    fireEvent.change(screen.getByTestId('rule-nth'), { target: { value: '1' } });
    fireEvent.click(screen.getByTestId('rule-nth-day-3'));
    fireEvent.click(screen.getByTestId('rule-save'));
    expect(client.editBlockRule).toHaveBeenCalledWith('r1', {
      byDay: [1, 3],
      byMonthDay: null,
      bySetPos: 1,
    });
  });

  it('skips the occurrence it was opened from', () => {
    const client = makeClient();
    renderPanel(client, ruleOf(), 42);
    fireEvent.click(screen.getByTestId('rule-skip'));
    expect(client.skipOccurrence).toHaveBeenCalledWith('r1', 42);
  });

  it('lists the skipped occurrences and restores one', () => {
    const skipped = daysFromCivil(2026, 1, 19);
    const client = makeClient([skipped]);
    renderPanel(client, ruleOf(), 42);
    expect(screen.getByText('2026-01-19')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`rule-restore-${skipped}`));
    expect(client.unskipOccurrence).toHaveBeenCalledWith('r1', skipped);
  });

  it('deletes the rule with confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const client = makeClient();
    renderPanel(client, ruleOf());
    fireEvent.click(screen.getByTestId('rule-delete'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(client.removeBlockRule).toHaveBeenCalledWith('r1');
  });
});

describe('RuleDetailPanel time zone hint', () => {
  it('warns when the rule keeps another zone', () => {
    renderPanel(makeClient(), ruleOf({ tzOffset: DEVICE_TZ + 3_600_000 }));
    expect(screen.getByTestId('rule-tz-hint').textContent).toContain(formatOffset(DEVICE_TZ + 3_600_000));
  });

  it('stays quiet for a rule in the device zone', () => {
    renderPanel(makeClient(), ruleOf());
    expect(screen.queryByTestId('rule-tz-hint')).toBeNull();
  });
});
