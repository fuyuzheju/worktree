import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../src/i18n';
import { AuthPage } from '../src/pages/AuthPage';

const SERVER = 'http://localhost:3000';

function renderPage(props: Partial<Parameters<typeof AuthPage>[0]> = {}) {
  const onAuthed = vi.fn();
  const onUseLocal = vi.fn();
  render(
    <I18nProvider lang="en">
      <AuthPage serverUrl={SERVER} user="alice" onAuthed={onAuthed} onUseLocal={onUseLocal} {...props} />
    </I18nProvider>,
  );
  return { onAuthed, onUseLocal };
}

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const fillAndSubmit = async (username = 'alice', password = 'hunter2222') => {
  fireEvent.change(screen.getByTestId('auth-username'), { target: { value: username } });
  fireEvent.change(screen.getByTestId('auth-password'), { target: { value: password } });
  fireEvent.click(screen.getByTestId('auth-submit'));
};

describe('AuthPage', () => {
  it('logs in and reports the issued token', async () => {
    const calls = stubFetch(() =>
      new Response(JSON.stringify({ username: 'alice', token: 'tok-1', tokenId: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { onAuthed } = renderPage();
    await fillAndSubmit();
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith('alice', { token: 'tok-1', tokenId: 3, label: undefined }));
    expect(calls[0]!.url).toBe(`${SERVER}/api/login`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ username: 'alice', password: 'hunter2222' });
  });

  it('registers in register mode', async () => {
    const calls = stubFetch(() =>
      new Response(JSON.stringify({ username: 'alice', token: 'tok-2', tokenId: 4 }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { onAuthed } = renderPage();
    fireEvent.click(screen.getByTestId('auth-mode-register'));
    await fillAndSubmit();
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith('alice', { token: 'tok-2', tokenId: 4, label: undefined }));
    expect(calls[0]!.url).toBe(`${SERVER}/api/register`);
  });

  it('sends the device label when provided', async () => {
    const calls = stubFetch(() =>
      new Response(JSON.stringify({ username: 'alice', token: 'tok-1', tokenId: 3 }), { status: 200 }),
    );
    const { onAuthed } = renderPage();
    fireEvent.change(screen.getByTestId('auth-label'), { target: { value: '  my phone ' } });
    await fillAndSubmit();
    await waitFor(() => expect(onAuthed).toHaveBeenCalledWith('alice', { token: 'tok-1', tokenId: 3, label: 'my phone' }));
    expect(JSON.parse(calls[0]!.init.body as string).label).toBe('my phone');
  });

  it('shows the invalid-credentials message on 401', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'invalid username or password' }), { status: 401 }));
    renderPage();
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('auth-error').textContent).toBe('Invalid username or password'));
  });

  it('shows the username-taken message on 409', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'username taken' }), { status: 409 }));
    renderPage();
    fireEvent.click(screen.getByTestId('auth-mode-register'));
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('auth-error').textContent).toBe('Username already taken'));
  });

  it('rejects a short password locally', async () => {
    const calls = stubFetch(() => new Response('{}', { status: 500 }));
    renderPage();
    await fillAndSubmit('alice', 'short');
    await waitFor(() =>
      expect(screen.getByTestId('auth-error').textContent).toBe('Password must be at least 8 characters'),
    );
    expect(calls).toHaveLength(0);
  });

  it('offers the local user as an escape hatch', () => {
    const { onUseLocal } = renderPage();
    fireEvent.click(screen.getByTestId('auth-use-local'));
    expect(onUseLocal).toHaveBeenCalled();
  });
});
