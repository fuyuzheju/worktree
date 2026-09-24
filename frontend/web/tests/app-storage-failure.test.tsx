import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';

const CONFIG = {
  serverUrl: 'http://localhost:3000',
  user: 'local',
  display: { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' },
  lang: 'en',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App storage failure', () => {
  it('banners a failed save instead of dropping it silently', () => {
    localStorage.setItem('worktree.config', JSON.stringify(CONFIG));
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'worktree.state.local') throw new DOMException('quota exceeded', 'QuotaExceededError');
      write(key, value);
    });
    render(<App />);
    expect(screen.queryByTestId('storage-failure')).toBeNull();

    // Selecting the root opens its detail panel; adding a child is an edit,
    // and the local user's edits go straight into the persisted history.
    const rootRow = screen.getByTestId('tree-view').querySelector('[data-node-id="root"]');
    if (rootRow === null) throw new Error('root row not found');
    fireEvent.click(rootRow);
    fireEvent.change(screen.getByTestId('detail-child-name'), { target: { value: 'A' } });
    fireEvent.click(screen.getByTestId('detail-child-apply'));

    const banner = screen.getByTestId('storage-failure');
    expect(banner.textContent).toContain('Changes are not being saved on this device');
    expect(banner.textContent).toContain('quota exceeded');
  });
});
