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

const configFor = (user: string) => ({
  serverUrl: 'http://localhost:3000',
  user,
  display: { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' },
  lang: 'en',
});

describe('App auth gate', () => {
  it('shows the auth screen for a server user without a token', () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('alice')));
    render(<App />);
    expect(screen.getByTestId('auth-submit')).toBeDefined();
    expect(screen.getByTestId('auth-username').getAttribute('value')).toBe('alice');
  });

  it('renders the shell directly for the local user without a token', () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('local')));
    render(<App />);
    expect(screen.queryByTestId('auth-submit')).toBeNull();
    expect(screen.getByText('WORKTREE')).toBeDefined();
  });

  it('logs in and swaps to the shell with the stored token', async () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('alice')));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ username: 'alice', token: 'tok-1', tokenId: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    render(<App />);
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'hunter2222' } });
    fireEvent.click(screen.getByTestId('auth-submit'));
    await waitFor(() => expect(screen.queryByTestId('auth-submit')).toBeNull());
    // the token was persisted for this (server, user)
    const raw = localStorage.getItem('worktree.token.localhost_3000.alice')!;
    expect(JSON.parse(raw)).toEqual({ token: 'tok-1', tokenId: 3, label: undefined });
  });

  it('a server user with a stored token skips the auth screen', () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('alice')));
    localStorage.setItem('worktree.token.localhost_3000.alice', JSON.stringify({ token: 'tok-1', tokenId: 3 }));
    render(<App />);
    expect(screen.queryByTestId('auth-submit')).toBeNull();
    expect(screen.getByText('WORKTREE')).toBeDefined();
    // the client connected with the token in the WS URL
    expect(FakeWebSocket.instances[0]!.url).toContain('token=tok-1');
  });

  it('adopts the authenticated username when logging in as someone else (regression)', async () => {
    // config.user is "u" (no such account, no token) — the user then logs in
    // with the credentials of "t". The app must adopt "t", not keep "u".
    localStorage.setItem('worktree.config', JSON.stringify(configFor('u')));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ username: 't', token: 'tok-9', tokenId: 9 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    render(<App />);
    expect(screen.getByTestId('auth-username').getAttribute('value')).toBe('u');
    fireEvent.change(screen.getByTestId('auth-username'), { target: { value: 't' } });
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'hunter2222' } });
    fireEvent.click(screen.getByTestId('auth-submit'));
    await waitFor(() => expect(screen.queryByTestId('auth-submit')).toBeNull());

    // the config now says "t" and the token lives under "t", not "u"
    expect(JSON.parse(localStorage.getItem('worktree.config')!).user).toBe('t');
    expect(localStorage.getItem('worktree.token.localhost_3000.t')).not.toBeNull();
    expect(localStorage.getItem('worktree.token.localhost_3000.u')).toBeNull();
    // the client runs as "t" with t's token
    expect(FakeWebSocket.instances[0]!.url).toContain('token=tok-9');
  });

  it('the settings dropdown lists logged-in users and switches without the auth screen', () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('alice')));
    localStorage.setItem('worktree.token.localhost_3000.alice', JSON.stringify({ token: 'tok-a', tokenId: 1 }));
    localStorage.setItem('worktree.token.localhost_3000.bob', JSON.stringify({ token: 'tok-b', tokenId: 2 }));
    render(<App />);
    fireEvent.click(screen.getByText('Settings'));

    const select = screen.getByTestId('settings-user-select') as HTMLSelectElement;
    expect(select.value).toBe('alice');
    const options = [...select.options].map((o) => o.value);
    expect(options).toEqual(['local', 'alice', 'bob']);

    fireEvent.change(select, { target: { value: 'bob' } });
    expect(screen.queryByTestId('auth-submit')).toBeNull();
    expect(JSON.parse(localStorage.getItem('worktree.config')!).user).toBe('bob');
    expect(select.value).toBe('bob');
  });

  it('only the "log in another user" button opens the auth screen while logged in', () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('alice')));
    localStorage.setItem('worktree.token.localhost_3000.alice', JSON.stringify({ token: 'tok-a', tokenId: 1 }));
    render(<App />);
    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(screen.getByTestId('settings-login-other'));
    expect(screen.getByTestId('auth-submit')).toBeDefined();
    expect(screen.getByTestId('auth-username').getAttribute('value')).toBe('alice');
  });

  it('logout revokes the token and lands on the offline user, not the auth screen', async () => {
    localStorage.setItem('worktree.config', JSON.stringify(configFor('alice')));
    localStorage.setItem('worktree.token.localhost_3000.alice', JSON.stringify({ token: 'tok-a', tokenId: 1 }));
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );
    render(<App />);
    fireEvent.click(screen.getByText('Settings'));
    fireEvent.click(screen.getByTestId('settings-logout'));

    await waitFor(() => expect(JSON.parse(localStorage.getItem('worktree.config')!).user).toBe('local'));
    expect(calls).toContain('http://localhost:3000/api/logout');
    expect(localStorage.getItem('worktree.token.localhost_3000.alice')).toBeNull();
    expect(screen.queryByTestId('auth-submit')).toBeNull();
    expect(screen.getByText('WORKTREE')).toBeDefined();
  });
});
