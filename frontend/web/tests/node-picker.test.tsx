import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import { I18nProvider } from '../src/i18n';
import type { DisplayPrefs } from '../src/config';
import { NodePicker } from '../src/components/NodePicker';

const display: DisplayPrefs = { showId: false, showWeight: false, showReminders: false, filterMode: 'hide' };

const tree: Node = Tree.fromOps([
  { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'alpha', weight: 1 },
  { kind: 'add', parentId: 'a', id: 'b', name: 'beta', weight: 1 },
]).getRoot();

function renderPicker(currentId: string | null, onPick = vi.fn(), onClose = vi.fn()) {
  render(
    <I18nProvider lang="en">
      <NodePicker tree={tree} display={display} currentId={currentId} onPick={onPick} onClose={onClose} />
    </I18nProvider>,
  );
  return { onPick, onClose };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NodePicker', () => {
  it('shows the whole tree expanded', () => {
    renderPicker(null);
    expect(screen.getByTestId('tree-view')).toBeInTheDocument();
    expect(screen.getByText(/alpha/)).toBeInTheDocument();
    expect(screen.getByText(/beta/)).toBeInTheDocument();
  });

  it('picks a node and closes on click', () => {
    const { onPick, onClose } = renderPicker(null);
    fireEvent.click(screen.getByRole('button', { name: /alpha/ }));
    expect(onPick).toHaveBeenCalledWith('a');
    expect(onClose).toHaveBeenCalled();
  });

  it('clears the link via the footer button', () => {
    const { onPick, onClose } = renderPicker('a');
    fireEvent.click(screen.getByTestId('node-picker-clear'));
    expect(onPick).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    const { onPick, onClose } = renderPicker(null);
    fireEvent.click(screen.getByTestId('node-picker'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
