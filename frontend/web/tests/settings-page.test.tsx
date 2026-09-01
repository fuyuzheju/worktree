import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { LOCAL_USER } from '../src/config';
import type { AppConfig } from '../src/config';
import { SettingsPage } from '../src/pages/SettingsPage';

const tree: Node = Tree.fromOps([{ kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 }]).getRoot();

function makeConfig(calendarDays: number): AppConfig {
  return {
    serverUrl: 'http://localhost:1',
    user: LOCAL_USER,
    display: { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' },
    lang: 'en',
    calendarDays,
  };
}

function renderSettings(calendarDays: number, updateConfig = vi.fn()) {
  const client = { getPendingCount: () => 0 } as unknown as WorktreeClient;
  render(
    <I18nProvider lang="en">
      <SettingsPage
        config={makeConfig(calendarDays)}
        client={client}
        tree={tree}
        updateConfig={updateConfig}
        onClearCache={vi.fn()}
        onLogout={vi.fn()}
        onLoginOther={vi.fn()}
      />
    </I18nProvider>,
  );
  return { updateConfig };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SettingsPage calendar', () => {
  it('renders the configured day count', () => {
    renderSettings(5);
    expect(screen.getByTestId<HTMLInputElement>('settings-calendar-days').value).toBe('5');
  });

  it('updates the day count within bounds', () => {
    const { updateConfig } = renderSettings(7);
    fireEvent.change(screen.getByTestId('settings-calendar-days'), { target: { value: '6' } });
    expect(updateConfig).toHaveBeenCalledWith({ calendarDays: 6 });
  });

  it('clamps out-of-range values to 3–9', () => {
    const { updateConfig } = renderSettings(7);
    fireEvent.change(screen.getByTestId('settings-calendar-days'), { target: { value: '12' } });
    expect(updateConfig).toHaveBeenCalledWith({ calendarDays: 9 });
    fireEvent.change(screen.getByTestId('settings-calendar-days'), { target: { value: '1' } });
    expect(updateConfig).toHaveBeenCalledWith({ calendarDays: 3 });
  });
});
