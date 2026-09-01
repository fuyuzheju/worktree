import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree, filterTree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { FilteredNode, NodeFilter } from '@worktree/core';
import { I18nProvider } from '../src/i18n';
import { TreeView } from '../src/components/TreeView';
import type { DisplayPrefs } from '../src/config';

const display: DisplayPrefs = { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' };

const tree = Tree.fromOps([
  { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
  { kind: 'complete', id: 'aaaa-1' },
  { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'beta', weight: 1 },
  { kind: 'add', parentId: ROOT_ID, id: 'cccc-1', name: 'gamma', weight: 2 },
]).getRoot();

function Harness({
  onSelect,
  filter,
  filterActive,
  highlightMatches,
}: {
  onSelect: (id: string) => void;
  filter?: NodeFilter;
  filterActive?: boolean;
  highlightMatches?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['aaaa-1']));
  const view: FilteredNode = filter !== undefined ? filterTree(tree, filter) : filterTree(tree, {});
  return (
    <I18nProvider lang="en">
      <TreeView
        root={view}
        expanded={expanded}
        selectedId={null}
        display={display}
        onToggle={(id) =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onSelect={onSelect}
        filterActive={filterActive}
        highlightMatches={highlightMatches}
      />
    </I18nProvider>
  );
}

describe('TreeView', () => {
  it('renders the root line, connectors and node text in CLI format', () => {
    render(<Harness onSelect={() => undefined} />);
    const view = screen.getByTestId('tree-view');
    expect(view.textContent).toContain('workroot');
    // completed alpha sinks below uncompleted gamma
    expect(view.textContent).toContain('├── gamma [cccc] w:2');
    // the double space is the check-mark SVG slot, which has no text content
    expect(view.textContent).toContain('└── alpha [aaaa]  w:1');
    expect(view.textContent).toContain('    └── beta [bbbb] w:1');
  });

  it('colors completed rows green and uncompleted rows yellow', () => {
    render(<Harness onSelect={() => undefined} />);
    const alphaBtn = screen.getByRole('button', { name: /alpha \[aaaa\]/ });
    const gammaBtn = screen.getByRole('button', { name: /gamma \[cccc\]/ });
    expect(alphaBtn.className).toContain('bg-green-100');
    expect(gammaBtn.className).toContain('bg-yellow-100');
  });

  it('collapses children when the chevron is clicked', () => {
    render(<Harness onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /beta \[bbbb\]/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'collapse' }));
    expect(screen.queryByRole('button', { name: /beta \[bbbb\]/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'expand' }));
    expect(screen.getByRole('button', { name: /beta \[bbbb\]/ })).toBeTruthy();
  });

  it('calls onSelect when a node row is clicked', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /alpha \[aaaa\]/ }));
    expect(onSelect).toHaveBeenCalledWith('aaaa-1');
  });

  it('calls onSelect with ROOT_ID when the root line is clicked', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'workroot' }));
    expect(onSelect).toHaveBeenCalledWith(ROOT_ID);
  });

  it('shows only matches plus their ancestor chain when a filter is active', () => {
    render(<Harness onSelect={() => undefined} filter={{ keyword: 'beta' }} filterActive />);
    expect(screen.getByRole('button', { name: /alpha \[aaaa\]/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /beta \[bbbb\]/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /gamma \[cccc\]/ })).toBeNull();
  });

  it('dims context ancestors in hide mode', () => {
    render(<Harness onSelect={() => undefined} filter={{ keyword: 'beta' }} filterActive />);
    const alphaBtn = screen.getByRole('button', { name: /alpha \[aaaa\]/ });
    const betaBtn = screen.getByRole('button', { name: /beta \[bbbb\]/ });
    expect(alphaBtn.className).toContain('opacity-50');
    expect(betaBtn.className).not.toContain('opacity-50');
  });

  it('shows the filtered-empty message when nothing matches', () => {
    render(<Harness onSelect={() => undefined} filter={{ keyword: 'zzz' }} filterActive />);
    expect(screen.getByText('No nodes match the filter.')).toBeTruthy();
  });

  it('does not outline matched rows in hide mode even when a filter is active', () => {
    render(<Harness onSelect={() => undefined} filter={{ keyword: 'beta' }} filterActive />);
    const betaBtn = screen.getByRole('button', { name: /beta \[bbbb\]/ });
    expect(betaBtn.className).not.toContain('outline-blue-400');
  });

  it('outlines matched rows only in highlight mode', () => {
    render(
      <Harness onSelect={() => undefined} filter={{ keyword: 'beta' }} filterActive highlightMatches />,
    );
    const betaBtn = screen.getByRole('button', { name: /beta \[bbbb\]/ });
    expect(betaBtn.className).toContain('outline-blue-400');
  });
});
