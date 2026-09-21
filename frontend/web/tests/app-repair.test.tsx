import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  close(): void {}
}

beforeEach(() => {
  localStorage.clear();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App repair gate', () => {
  it('shows the repair page for a cached history that no longer replays', async () => {
    localStorage.setItem(
      'worktree.config',
      JSON.stringify({
        serverUrl: 'http://localhost:3000',
        user: 'local',
        display: { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' },
        lang: 'en',
      }),
    );
    // Legacy cache: complete "alpha" while its child "beta" is not completed.
    localStorage.setItem(
      'worktree.state.local',
      JSON.stringify({
        confirmed: [
          { id: 'h1', op: { kind: 'add', parentId: 'root', id: 'a', name: 'alpha', weight: 1 } },
          { id: 'h2', op: { kind: 'add', parentId: 'a', id: 'b', name: 'beta', weight: 1 } },
          { id: 'h3', op: { kind: 'complete', id: 'a' } },
        ],
        pending: [],
      }),
    );

    render(<App />);
    expect(await screen.findByText('History needs repair')).toBeTruthy();
    expect(screen.getByText('complete "alpha"')).toBeTruthy();
    expect(screen.queryByText('WORKTREE')).toBeNull();

    fireEvent.click(screen.getByTestId('repair-apply'));
    await waitFor(() => expect(screen.queryByText('History needs repair')).toBeNull());
    expect(screen.getByText('WORKTREE')).toBeTruthy();
    // The repaired history is persisted without the dropped entry.
    const saved: unknown = JSON.parse(localStorage.getItem('worktree.state.local') ?? 'null');
    expect(JSON.stringify(saved)).not.toContain('"kind":"complete"');
  });
});
