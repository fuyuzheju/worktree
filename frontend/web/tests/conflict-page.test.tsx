import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ROOT_ID } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import type { Conflict } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { ConflictPage } from '../src/pages/ConflictPage';
import type { DisplayPrefs } from '../src/config';

const display: DisplayPrefs = { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' };

const conflict: Conflict = {
  base: [{ id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } }],
  baseId: 'op1',
  cursorFound: true,
  serverBranch: [{ id: 'op2', op: { kind: 'remove', id: 'aaaa-1' } }],
  localBranch: [{ kind: 'add', id: 'op3', op: { kind: 'rename', id: 'aaaa-1', name: 'alpha2' } }],
};

function makeClient(resolveConflict: (choice: string) => Promise<void>): WorktreeClient {
  return {
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
    // Local branch: the renamed node (row content is split into icon/text parts).
    const row = screen.getByText(
      (_, el) => el?.getAttribute('data-node-id') === 'aaaa-1' && el.textContent?.trim() === 'alpha2 [aaaa] w:1',
    );
    expect(row).toBeTruthy();
  });

  it('shows different trees for a stale-undo conflict', () => {
    const undoConflict: Conflict = {
      base: [
        { id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } },
        { id: 'op2', op: { kind: 'add', parentId: ROOT_ID, id: 'bbbb-1', name: 'beta', weight: 2 } },
      ],
      baseId: 'op2',
      cursorFound: true,
      serverBranch: [
        { id: 'op3', op: { kind: 'add', parentId: ROOT_ID, id: 'cccc-1', name: 'gamma', weight: 3 } },
      ],
      localBranch: [{ kind: 'remove', id: 'op2' }],
    };
    render(
      <I18nProvider lang="en">
        <ConflictPage
          conflict={undoConflict}
          client={makeClient(async () => undefined)}
          display={display}
        />
      </I18nProvider>,
    );
    // Server version keeps beta and adds gamma; your version applies the undo.
    const serverView = screen.getAllByTestId('tree-view')[0]!;
    const localView = screen.getAllByTestId('tree-view')[1]!;
    expect(serverView.textContent).toContain('beta');
    expect(serverView.textContent).toContain('gamma');
    expect(localView.textContent).not.toContain('beta');
    expect(localView.textContent).toContain('alpha');
    // Nodes that exist only on the server side are highlighted there.
    expect(serverView.querySelector('[data-node-id="bbbb-1"]')?.className).toContain('bg-rose-100');
    expect(serverView.querySelector('[data-node-id="cccc-1"]')?.className).toContain('bg-rose-100');
    // The shared alpha is not highlighted on either side.
    expect(serverView.querySelector('[data-node-id="aaaa-1"]')?.className).not.toContain('bg-rose-100');
    expect(localView.querySelector('[data-node-id="aaaa-1"]')?.className).not.toContain('bg-rose-100');
  });

  it('highlights nodes that differ on both sides', () => {
    const changed: Conflict = {
      base: [{ id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } }],
      baseId: 'op1',
      cursorFound: true,
      serverBranch: [{ id: 'op2', op: { kind: 'rename', id: 'aaaa-1', name: 'alphaX' } }],
      localBranch: [{ kind: 'add', id: 'op3', op: { kind: 'rename', id: 'aaaa-1', name: 'alphaY' } }],
    };
    render(
      <I18nProvider lang="en">
        <ConflictPage conflict={changed} client={makeClient(async () => undefined)} display={display} />
      </I18nProvider>,
    );
    const serverView = screen.getAllByTestId('tree-view')[0]!;
    const localView = screen.getAllByTestId('tree-view')[1]!;
    expect(serverView.textContent).toContain('alphaX');
    expect(localView.textContent).toContain('alphaY');
    expect(serverView.querySelector('[data-node-id="aaaa-1"]')?.className).toContain('bg-amber-100');
    expect(localView.querySelector('[data-node-id="aaaa-1"]')?.className).toContain('bg-amber-100');
  });

  it('says so when both versions are identical', () => {
    const identical: Conflict = {
      base: [{ id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } }],
      baseId: 'op1',
      cursorFound: true,
      serverBranch: [],
      localBranch: [],
    };
    render(
      <I18nProvider lang="en">
        <ConflictPage conflict={identical} client={makeClient(async () => undefined)} display={display} />
      </I18nProvider>,
    );
    expect(screen.getByText('Both versions are identical.')).toBeTruthy();
  });

  it('shows the whole server history when the cursor is gone (rewrite)', () => {
    const rewritten: Conflict = {
      base: [
        { id: 'op1', op: { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 } },
        { id: 'op2', op: { kind: 'add', parentId: ROOT_ID, id: 'bbbb-1', name: 'beta', weight: 2 } },
      ],
      baseId: 'op2',
      cursorFound: false,
      serverBranch: [
        { id: 'op9', op: { kind: 'add', parentId: ROOT_ID, id: 'cccc-1', name: 'gamma', weight: 3 } },
      ],
      localBranch: [{ kind: 'add', id: 'op3', op: { kind: 'rename', id: 'bbbb-1', name: 'beta2' } }],
    };
    render(
      <I18nProvider lang="en">
        <ConflictPage
          conflict={rewritten}
          client={makeClient(async () => undefined)}
          display={display}
        />
      </I18nProvider>,
    );
    const serverView = screen.getAllByTestId('tree-view')[0]!;
    const localView = screen.getAllByTestId('tree-view')[1]!;
    // Server: only the rewritten history (base is gone there).
    expect(serverView.textContent).toContain('gamma');
    expect(serverView.textContent).not.toContain('alpha');
    // Local: the pre-rewrite base plus the pending rename.
    expect(localView.textContent).toContain('alpha');
    expect(localView.textContent).toContain('beta2');
  });

  it('resolves with the server branch', async () => {
    const resolveConflict = vi.fn(async () => undefined);
    renderPage(resolveConflict);
    fireEvent.click(screen.getByRole('button', { name: 'Keep server version' }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith('server'));
  });

  it('resolves with the local branch (no per-op filtering in the page)', async () => {
    const resolveConflict = vi.fn(async () => undefined);
    renderPage(resolveConflict);
    fireEvent.click(screen.getByRole('button', { name: 'Keep my version' }));
    await waitFor(() => expect(resolveConflict).toHaveBeenCalledWith('local'));
  });
});
