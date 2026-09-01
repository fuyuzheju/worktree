import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ROOT_ID } from '@worktree/core';
import type { HistoryNode, HistoryOperation } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { StatusBar } from '../src/components/StatusBar';

const addOp = (id: string): HistoryOperation => ({
  kind: 'add',
  id,
  op: { kind: 'add', parentId: ROOT_ID, id, name: id, weight: 1 },
});

function makeClient(opts: { pending?: HistoryOperation[]; confirmed?: HistoryNode[] } = {}): WorktreeClient {
  return {
    getPending: () => opts.pending ?? [],
    getConfirmed: () => opts.confirmed ?? [],
    undo: vi.fn(),
    reconnect: vi.fn().mockResolvedValue(true),
    isLocal: () => false,
  } as unknown as WorktreeClient;
}

function renderBar(client: WorktreeClient, online = true, pendingCount = 0) {
  render(
    <I18nProvider lang="en">
      <StatusBar online={online} pendingCount={pendingCount} client={client} />
    </I18nProvider>,
  );
}

const undoButton = (): HTMLButtonElement => screen.getByTestId<HTMLButtonElement>('status-undo');

describe('StatusBar undo button', () => {
  it('is disabled when there is nothing to undo', () => {
    const client = makeClient();
    renderBar(client);
    expect(undoButton().disabled).toBe(true);
    fireEvent.click(undoButton());
    expect(client.undo).not.toHaveBeenCalled();
  });

  it('is disabled when the only pending op is an undo and the chain is exhausted', () => {
    const client = makeClient({
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
      pending: [{ kind: 'remove', id: 'h1' }],
    });
    renderBar(client);
    expect(undoButton().disabled).toBe(true);
  });

  it('is enabled when an undo is pending but older confirmed ops remain', () => {
    const client = makeClient({
      confirmed: [
        { id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } },
        { id: 'h2', op: { kind: 'add', parentId: ROOT_ID, id: 'b', name: 'B', weight: 2 } },
      ],
      pending: [{ kind: 'remove', id: 'h2' }],
    });
    renderBar(client);
    expect(undoButton().disabled).toBe(false);
    fireEvent.click(undoButton());
    expect(client.undo).toHaveBeenCalledTimes(1);
  });

  it('is enabled with a pending add and calls undo on click', () => {
    const client = makeClient({ pending: [addOp('h2')] });
    renderBar(client);
    expect(undoButton().disabled).toBe(false);
    fireEvent.click(undoButton());
    expect(client.undo).toHaveBeenCalledTimes(1);
  });

  it('is enabled with only confirmed ops and calls undo on click', () => {
    const client = makeClient({
      confirmed: [{ id: 'h1', op: { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'A', weight: 1 } }],
    });
    renderBar(client);
    expect(undoButton().disabled).toBe(false);
    fireEvent.click(undoButton());
    expect(client.undo).toHaveBeenCalledTimes(1);
  });
});

describe('StatusBar auth failure', () => {
  it('shows the unauthorized state with a relogin button', () => {
    const onRelogin = vi.fn();
    render(
      <I18nProvider lang="en">
        <StatusBar
          online={false}
          pendingCount={0}
          client={makeClient()}
          authFailed
          onRelogin={onRelogin}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('session expired')).toBeDefined();
    expect(screen.queryByTestId('status-reconnect')).toBeNull();
    fireEvent.click(screen.getByTestId('status-relogin'));
    expect(onRelogin).toHaveBeenCalledTimes(1);
  });
});

describe('StatusBar reconnect button', () => {
  it('is hidden while online', () => {
    const client = makeClient();
    renderBar(client, true);
    expect(screen.queryByTestId('status-reconnect')).toBeNull();
  });

  it('shows while offline and calls reconnect on click', () => {
    const client = makeClient();
    renderBar(client, false);
    fireEvent.click(screen.getByTestId('status-reconnect'));
    expect(client.reconnect).toHaveBeenCalledTimes(1);
  });

  it('is hidden for the local user even when offline', () => {
    const client = { ...makeClient(), isLocal: () => true } as unknown as WorktreeClient;
    renderBar(client, false);
    expect(screen.queryByTestId('status-reconnect')).toBeNull();
  });
});
