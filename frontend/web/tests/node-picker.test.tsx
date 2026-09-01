import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Node, NodeFilter } from '@worktree/core';
import { I18nProvider } from '../src/i18n';
import type { DisplayPrefs } from '../src/config';
import { FilterProvider } from '../src/filter-context';
import { NodePicker } from '../src/components/NodePicker';

const display: DisplayPrefs = { showId: false, showWeight: false, showReminders: false, filterMode: 'hide' };

const tree: Node = Tree.fromOps([
  { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'alpha', weight: 1 },
  { kind: 'add', parentId: 'a', id: 'b', name: 'beta', weight: 1 },
]).getRoot();

function renderPicker(
  currentId: string | null,
  options: { filter?: NodeFilter; mode?: DisplayPrefs['filterMode'] } = {},
  onPick = vi.fn(),
  onClose = vi.fn(),
) {
  const { filter = {}, mode = 'hide' } = options;
  render(
    <I18nProvider lang="en">
      <FilterProvider
        filter={filter}
        mode={mode}
        setFilter={() => undefined}
        setMode={() => undefined}
      >
        <NodePicker tree={tree} display={display} currentId={currentId} onPick={onPick} onClose={onClose} />
      </FilterProvider>
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

  it('applies the active filter in hide mode', () => {
    renderPicker(null, { filter: { keyword: 'alpha' } });
    expect(screen.getByRole('button', { name: /alpha/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /beta/ })).toBeNull();
  });

  it('shows the empty hint when the filter matches nothing', () => {
    renderPicker(null, { filter: { keyword: 'zzz' } });
    expect(screen.getByText('No nodes match the filter.')).toBeTruthy();
  });

  it('keeps the whole tree in highlight mode and outlines matches', () => {
    renderPicker(null, { filter: { keyword: 'alpha' }, mode: 'highlight' });
    expect(screen.getByRole('button', { name: /alpha/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /beta/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /alpha/ }).className).toContain('outline-blue-400');
  });
});
