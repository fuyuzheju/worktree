import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { captureParamText } from '../src/capture-params';
import { QuickCapture } from '../src/components/QuickCapture';
import App from '../src/App';

const localClient = (): WorktreeClient =>
  new WorktreeClient({ serverUrl: 'http://localhost:1', user: 'local', local: true });

const renderOverlay = (client: WorktreeClient, initialText = '', onClose = vi.fn()) => {
  render(
    <I18nProvider lang="en">
      <QuickCapture client={client} path="/tmp" initialText={initialText} onClose={onClose} />
    </I18nProvider>,
  );
  return { onClose };
};

const stubClipboard = (readText: () => Promise<string>): void => {
  vi.stubGlobal('navigator', { clipboard: { readText } });
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('captureParamText', () => {
  it('reads the quick flag, text and share-target params', () => {
    expect(captureParamText('')).toBeNull();
    expect(captureParamText('?node=x')).toBeNull();
    expect(captureParamText('?quick=1')).toBe('');
    expect(captureParamText('?quick=1&text=hello')).toBe('hello');
    expect(captureParamText('?text=note&title=t&url=u')).toBe('note');
    expect(captureParamText('?quick=1&title=Title&url=https://x')).toBe('Title\nhttps://x');
    expect(captureParamText('?quick=1&url=https://x')).toBe('https://x');
  });
});

describe('QuickCapture', () => {
  it('captures the typed text under the path', async () => {
    const client = localClient();
    renderOverlay(client);
    fireEvent.change(screen.getByTestId('quick-capture-input'), { target: { value: 'buy milk' } });
    fireEvent.keyDown(screen.getByTestId('quick-capture-input'), { key: 'Enter' });
    const done = await screen.findByTestId('quick-capture-done');
    expect(done.textContent).toContain('captured /tmp/buy milk');
    expect(client.getTree().children[0].children[0].name).toBe('buy milk');
  });

  it('captures the clipboard on an empty Enter', async () => {
    stubClipboard(() => Promise.resolve('from clipboard'));
    const client = localClient();
    renderOverlay(client);
    fireEvent.keyDown(screen.getByTestId('quick-capture-input'), { key: 'Enter' });
    const done = await screen.findByTestId('quick-capture-done');
    expect(done.textContent).toContain('captured /tmp/from clipboard');
  });

  it('surfaces a clipboard denial instead of capturing nothing', async () => {
    stubClipboard(() => Promise.reject(new Error('denied')));
    renderOverlay(localClient());
    fireEvent.keyDown(screen.getByTestId('quick-capture-input'), { key: 'Enter' });
    const error = await screen.findByTestId('quick-capture-error');
    expect(error.textContent).toContain('denied');
  });

  it('shows a capture error inline and keeps the overlay open', async () => {
    const client = localClient();
    renderOverlay(client);
    fireEvent.change(screen.getByTestId('quick-capture-input'), { target: { value: 'a/b' } });
    fireEvent.keyDown(screen.getByTestId('quick-capture-input'), { key: 'Enter' });
    const error = await screen.findByTestId('quick-capture-error');
    expect(error.textContent).toContain('must not contain "/"');
    expect(screen.getByTestId('quick-capture')).toBeInTheDocument();
  });

  it('closes on Escape and on the backdrop', () => {
    const { onClose } = renderOverlay(localClient());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('quick-capture'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('capture entry points in the app', () => {
  it('opens the overlay prefilled from ?quick=1&text=… and strips the params', async () => {
    window.history.replaceState(null, '', '/?quick=1&text=hello%20world');
    render(<App />);
    const input = await screen.findByTestId('quick-capture-input');
    expect(input).toHaveValue('hello world');
    expect(window.location.search).toBe('');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect((await screen.findByTestId('quick-capture-done')).textContent).toContain('captured /tmp/hello world');
  });

  it('opens the overlay with Cmd/Ctrl+K', async () => {
    render(<App />);
    await screen.findByText('WORKTREE');
    expect(screen.queryByTestId('quick-capture')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await screen.findByTestId('quick-capture-input')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('quick-capture')).toBeNull());
  });
});
