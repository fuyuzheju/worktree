import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { NodeDetailPanel } from '../src/components/NodeDetailPanel';

function makeNode(ops: Parameters<typeof Tree.fromOps>[0], id: string): Node {
  return Tree.fromOps(ops).getNode(id)!;
}

function makeClient(node: Node): WorktreeClient {
  return {
    getTree: () => Tree.fromOps([]).getRoot(),
    removeNode: vi.fn(),
    setCompleted: vi.fn(),
    renameNode: vi.fn(),
    addNode: vi.fn(),
    moveNode: vi.fn(),
    copyNode: vi.fn(),
    addReminder: vi.fn(),
    removeReminder: vi.fn(),
    editReminder: vi.fn(),
    setNote: vi.fn(),
    setDeadline: vi.fn(),
  } as unknown as WorktreeClient;
}

function renderPanel(node: Node, client: WorktreeClient) {
  render(
    <I18nProvider lang="en">
      <NodeDetailPanel node={node} client={client} onClose={() => undefined} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NodeDetailPanel remove confirmation', () => {
  it('removes a completed node without prompting', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const node = makeNode(
      [
        { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
        { kind: 'complete', id: 'aaaa-1' },
      ],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-remove'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(client.removeNode).toHaveBeenCalledWith('aaaa-1');
  });

  it('prompts before removing an uncompleted node and respects a cancel', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const node = makeNode(
      [{ kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 }],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-remove'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(client.removeNode).not.toHaveBeenCalled();
  });

  it('removes an uncompleted node when the prompt is accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const node = makeNode(
      [{ kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 }],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-remove'));
    expect(client.removeNode).toHaveBeenCalledWith('aaaa-1');
  });
});

describe('NodeDetailPanel complete confirmation', () => {
  it('completes without prompting when every child is already completed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const node = makeNode(
      [
        { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
        { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'beta', weight: 1 },
        { kind: 'complete', id: 'bbbb-1' },
      ],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-complete'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(client.setCompleted).toHaveBeenCalledWith('aaaa-1', true);
  });

  it('prompts when children are uncompleted and respects a cancel', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const node = makeNode(
      [
        { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
        { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'beta', weight: 1 },
      ],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-complete'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(client.setCompleted).not.toHaveBeenCalled();
  });

  it('completes uncompleted descendants bottom-up when the prompt is accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const node = makeNode(
      [
        { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
        { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'beta', weight: 1 },
        { kind: 'add', parentId: 'bbbb-1', id: 'cccc-1', name: 'gamma', weight: 1 },
      ],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-complete'));
    expect(client.setCompleted).toHaveBeenNthCalledWith(1, 'cccc-1', true);
    expect(client.setCompleted).toHaveBeenNthCalledWith(2, 'bbbb-1', true);
    expect(client.setCompleted).toHaveBeenNthCalledWith(3, 'aaaa-1', true);
  });

  it('uncompletes without prompting when the node is completed', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const node = makeNode(
      [{ kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 }, { kind: 'complete', id: 'aaaa-1' }],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.click(screen.getByTestId('detail-complete'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(client.setCompleted).toHaveBeenCalledWith('aaaa-1', false);
  });
});

describe('NodeDetailPanel note and deadline editing', () => {
  const nodeWithFields = (): Node =>
    makeNode(
      [
        {
          kind: 'add',
          parentId: ROOT_ID,
          id: 'aaaa-1',
          name: 'alpha',
          weight: 1,
          note: 'hello',
          deadline: 1_760_000_000_000,
          createdAt: 1_750_000_000_000,
        },
      ],
      'aaaa-1',
    );

  it('shows createdAt and deadline in the metadata', () => {
    const node = nodeWithFields();
    renderPanel(node, makeClient(node));
    fireEvent.click(screen.getByTestId('detail-tab-info'));
    expect(screen.getByTestId('detail-created').textContent).toContain('2025-06-');
    expect(screen.getByTestId('detail-deadline-value').textContent).toContain('2025-10-');
  });

  it('shows a placeholder for legacy nodes without createdAt or deadline', () => {
    const node = makeNode(
      [{ kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 }],
      'aaaa-1',
    );
    renderPanel(node, makeClient(node));
    fireEvent.click(screen.getByTestId('detail-tab-info'));
    expect(screen.getByTestId('detail-created').textContent).toBe('—');
    expect(screen.getByTestId('detail-deadline-value').textContent).toBe('—');
  });

  it('ignores Enter while an IME is composing, applies it otherwise', () => {
    const node = makeNode(
      [{ kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 }],
      'aaaa-1',
    );
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.keyDown(screen.getByTestId('detail-rename-input'), { key: 'Enter', isComposing: true });
    expect(client.renameNode).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByTestId('detail-rename-input'), { key: 'Enter' });
    expect(client.renameNode).toHaveBeenCalled();
  });

  it('saves the note through client.setNote', () => {
    const node = nodeWithFields();
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.change(screen.getByTestId('detail-note'), { target: { value: 'updated' } });
    fireEvent.click(screen.getByTestId('detail-note-save'));
    expect(client.setNote).toHaveBeenCalledWith('aaaa-1', 'updated');
  });

  it('saves and clears the deadline through client.setDeadline', () => {
    const node = nodeWithFields();
    const client = makeClient(node);
    renderPanel(node, client);
    fireEvent.change(screen.getByTestId('detail-deadline'), { target: { value: '2026-09-01T10:00' } });
    fireEvent.click(screen.getByTestId('detail-deadline-save'));
    expect(client.setDeadline).toHaveBeenCalledWith('aaaa-1', new Date('2026-09-01T10:00').getTime());
    fireEvent.click(screen.getByTestId('detail-deadline-clear'));
    expect(client.setDeadline).toHaveBeenCalledWith('aaaa-1', null);
  });

  it('forwards the auto-reminder setting to setDeadline', () => {
    const node = nodeWithFields();
    const client = makeClient(node);
    render(
      <I18nProvider lang="en">
        <NodeDetailPanel
          node={node}
          client={client}
          onClose={() => undefined}
          autoReminder={{ enabled: true, pct: 30 }}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByTestId('detail-deadline'), { target: { value: '2026-09-01T10:00' } });
    fireEvent.click(screen.getByTestId('detail-deadline-save'));
    expect(client.setDeadline).toHaveBeenCalledWith('aaaa-1', new Date('2026-09-01T10:00').getTime(), {
      autoReminderEnabled: true,
      autoReminderPct: 30,
    });
    fireEvent.click(screen.getByTestId('detail-deadline-clear'));
    expect(client.setDeadline).toHaveBeenCalledWith('aaaa-1', null, {
      autoReminderEnabled: true,
      autoReminderPct: 30,
    });
  });
});
