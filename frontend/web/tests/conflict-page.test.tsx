import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { Conflict } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { ConflictPage } from '../src/pages/ConflictPage';
import type { DisplayPrefs } from '../src/config';

const display: DisplayPrefs = { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' };

const conflict: Conflict = {
  baseId: 'op1',
  serverBranch: [{ id: 'op2', op: { kind: 'remove', id: 'aaaa-1' } }],
  localBranch: [{ kind: 'add', id: 'op3', op: { kind: 'rename', id: 'aaaa-1', name: 'alpha2' } }],
};

function makeClient(resolveConflict: (choice: string) => Promise<void>): WorktreeClient {
  const localTree = Tree.fromOps([
    { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
    { kind: 'rename', id: 'aaaa-1', name: 'alpha2' },
  ]).getRoot();
  return {
    getConfirmed: () => [
      { id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } },
    ],
    getTree: () => localTree,
    resolveConflict,
  } as unknown as WorktreeClient;
}

function renderPage(resolveConflict: (choice: string) => Promise<void>) {
  render(
    <I18nProvider lang="en">
      <ConflictPage
        conflict={conflict}
        client={makeClient(resolveConflict)}
        display={display}
      />
    </I18nProvider>,
  );
}

describe('ConflictPage', () => {
  it('shows the two branches: server without alpha, local with alpha2', () => {
    renderPage(async () => undefined);
    expect(screen.getByText(/op1/)).toBeTruthy();
    expect(screen.getByText('1 new server op(s)')).toBeTruthy();
    expect(screen.getByText('1 pending local op(s)')).toBeTruthy();
    // Server branch: alpha was removed → empty tree hint on the server side.
    expect(screen.getAllByText('(empty tree — select the root to add a node)').length).toBe(1);
    // Local branch: the renamed node.
    expect(screen.getByText(/alpha2 \[aaaa\] w:1/)).toBeTruthy();
  });

  it('resolves with the server branch', async () => {
    const resolveConflict = vi.fn(async () => undefined);
    renderPage(resolveConflict);
    fireEvent.click(screen.getByRole('button', { name: 'Keep server version' }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith('server'));
  });

  it('falls back to adopting the server when no pending op survives', async () => {
    // The pending rename targets a node the server removed — nothing replays.
    const resolveConflict = vi.fn(async () => undefined);
    renderPage(resolveConflict);
    fireEvent.click(screen.getByRole('button', { name: 'Keep my version' }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith('server', []));
  });

  it('keeps surviving pending ops when keeping the local branch', async () => {
    const resolveConflict = vi.fn(async () => undefined);
    const pendingAdd = {
      kind: 'add' as const,
      id: 'op3',
      op: { kind: 'add' as const, parentId: ROOT_ID, id: 'mmmm-1', name: 'm', weight: 9 },
    };
    const conflict2: Conflict = { ...conflict, localBranch: [pendingAdd] };
    render(
      <I18nProvider lang="en">
        <ConflictPage conflict={conflict2} client={makeClient(resolveConflict)} display={display} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Keep my version' }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith('local', [pendingAdd]));
  });
});
