import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RepairDrop } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import { RepairPage } from '../src/pages/RepairPage';

const drop: RepairDrop = {
  entry: { id: 'h3', op: { kind: 'complete', id: 'a' } },
  reason: 'cannot complete "A": child "B" is not completed',
  description: 'complete "A"',
};

function makeClient(overrides: {
  planRepair?: () => Promise<RepairDrop[]>;
  repairHistory?: () => Promise<RepairDrop[]>;
  adoptServerHistory?: () => Promise<void>;
}): WorktreeClient {
  return {
    planRepair: async () => [drop],
    repairHistory: async () => [drop],
    adoptServerHistory: async () => {},
    ...overrides,
  } as unknown as WorktreeClient;
}

function renderPage(client: WorktreeClient) {
  render(
    <I18nProvider lang="en">
      <RepairPage client={client} />
    </I18nProvider>,
  );
}

describe('RepairPage', () => {
  it('lists the entries a repair would drop, with their reason', async () => {
    renderPage(makeClient({}));
    expect(await screen.findByText('Entries that will be dropped (1)')).toBeTruthy();
    expect(screen.getByText('complete "A"')).toBeTruthy();
    expect(screen.getByText(/child "B" is not completed/)).toBeTruthy();
    expect(screen.getByText('Drop them and repair')).toBeTruthy();
  });

  it('applies the repair on confirmation', async () => {
    const repairHistory = vi.fn(async () => [drop]);
    renderPage(makeClient({ repairHistory }));
    fireEvent.click(await screen.findByTestId('repair-apply'));
    await waitFor(() => expect(repairHistory).toHaveBeenCalledTimes(1));
  });

  it('shows the failure and offers a retry when applying fails', async () => {
    const repairHistory = vi.fn(async () => {
      throw new Error('server offline');
    });
    const planRepair = vi.fn(async () => [drop]);
    renderPage(makeClient({ planRepair, repairHistory }));
    fireEvent.click(await screen.findByTestId('repair-apply'));
    expect(await screen.findByText(/Repair failed: server offline/)).toBeTruthy();
    // The plan is re-read: a failed rewrite usually means the history moved.
    await waitFor(() => expect(planRepair).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Drop them and repair')).toBeTruthy();
  });

  it('shows the read failure and retries the plan', async () => {
    const planRepair = vi
      .fn<() => Promise<RepairDrop[]>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([drop]);
    renderPage(makeClient({ planRepair }));
    expect(await screen.findByText(/Could not read the history: network down/)).toBeTruthy();
    fireEvent.click(screen.getByText('Check again'));
    expect(await screen.findByText('complete "A"')).toBeTruthy();
  });

  it('reports a clean history when nothing needs dropping', async () => {
    renderPage(makeClient({ planRepair: async () => [] }));
    expect(await screen.findByText(/nothing to repair/)).toBeTruthy();
    expect(screen.queryByTestId('repair-apply')).toBeNull();
  });

  it('offers a full re-sync when the server history already replays', async () => {
    const adoptServerHistory = vi.fn(async () => {});
    renderPage(makeClient({ planRepair: async () => [], adoptServerHistory }));
    fireEvent.click(await screen.findByTestId('repair-adopt'));
    await waitFor(() => expect(adoptServerHistory).toHaveBeenCalledTimes(1));
  });

  it('shows the failure when the re-sync fails and re-reads the plan', async () => {
    const adoptServerHistory = vi.fn(async () => {
      throw new Error('server offline');
    });
    const planRepair = vi.fn(async () => []);
    renderPage(makeClient({ planRepair, adoptServerHistory }));
    fireEvent.click(await screen.findByTestId('repair-adopt'));
    expect(await screen.findByText(/Could not sync the server history: server offline/)).toBeTruthy();
    await waitFor(() => expect(planRepair).toHaveBeenCalledTimes(2));
  });
});
