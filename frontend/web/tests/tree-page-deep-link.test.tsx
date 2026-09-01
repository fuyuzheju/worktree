import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { FilterProvider } from '../src/filter-context';
import { TreePage } from '../src/pages/TreePage';

const DEFAULT_DISPLAY = { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' as const };

function makeTree(): Node {
  return Tree.fromOps([
    { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'a', weight: 1 },
    { kind: 'add', parentId: 'a', id: 'a-b', name: 'a-b', weight: 1 },
    { kind: 'add', parentId: ROOT_ID, id: 'c', name: 'c', weight: 2 },
  ]).getRoot();
}

function makeClient(): WorktreeClient {
  return { getTree: () => Tree.fromOps([]).getRoot() } as unknown as WorktreeClient;
}

function renderPage(props: {
  initialNodeId?: string;
  focusNode?: { id: string; nonce: number } | null;
}) {
  const client = makeClient();
  return render(
    <I18nProvider lang="en">
      <FilterProvider filter={{}} mode="hide" setFilter={() => undefined} setMode={() => undefined}>
        <TreePage
          tree={makeTree()}
          client={client}
          display={DEFAULT_DISPLAY}
          updateConfig={vi.fn()}
          initialNodeId={props.initialNodeId}
          focusNode={props.focusNode}
        />
      </FilterProvider>
    </I18nProvider>,
  );
}

function treePageElement(props: { focusNode?: { id: string; nonce: number } | null }) {
  return (
    <I18nProvider lang="en">
      <FilterProvider filter={{}} mode="hide" setFilter={() => undefined} setMode={() => undefined}>
        <TreePage
          tree={makeTree()}
          client={makeClient()}
          display={DEFAULT_DISPLAY}
          updateConfig={vi.fn()}
          focusNode={props.focusNode ?? null}
        />
      </FilterProvider>
    </I18nProvider>
  );
}

describe('TreePage deep link', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the node given by initialNodeId and expands its ancestors', () => {
    renderPage({ initialNodeId: 'a-b' });
    // The detail panel shows the deep-linked node's name.
    expect(screen.getByDisplayValue('a-b')).toBeTruthy();
    // Ancestors are expanded so the node row is visible in the tree.
    expect(screen.getByRole('button', { name: /a \[a\]/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /a-b \[a-b\]/ })).toBeTruthy();
  });

  it('selects the root when initialNodeId is the root', () => {
    renderPage({ initialNodeId: ROOT_ID });
    expect(screen.getByText('Workspace root')).toBeTruthy();
  });

  it('does not select anything when the node is unknown', () => {
    renderPage({ initialNodeId: 'missing' });
    expect(screen.getByText('Select a node to see its details.')).toBeTruthy();
  });

  it('re-focuses on focusNode changes with a fresh nonce', () => {
    const { rerender } = renderPage({});
    expect(screen.getByText('Select a node to see its details.')).toBeTruthy();

    rerender(treePageElement({ focusNode: { id: 'c', nonce: 1 } }));
    expect(screen.getByDisplayValue('c')).toBeTruthy();

    // A second focus on another node (fresh nonce) moves the selection.
    rerender(treePageElement({ focusNode: { id: 'a', nonce: 2 } }));
    expect(screen.getByDisplayValue('a')).toBeTruthy();
  });

  it('ignores a focusNode whose node does not exist', () => {
    const { rerender } = renderPage({ initialNodeId: 'a' });
    rerender(treePageElement({ focusNode: { id: 'nope', nonce: 3 } }));
    expect(screen.getByDisplayValue('a')).toBeTruthy();
  });
});
