import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Block, Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { I18nProvider } from '../src/i18n';
import type { DisplayPrefs } from '../src/config';
import { FilterProvider } from '../src/filter-context';
import { DEFAULT_PX_PER_HOUR, dayWidthCalc } from '../src/calendar-utils';
import { CalendarPage } from '../src/pages/CalendarPage';

/** The grid renders heights as percentages of the 24h day. */
const pct = (px: number): string => `${(px / (24 * DEFAULT_PX_PER_HOUR)) * 100}%`;

// Thu Jan 15 2026, 10:00 local — DST-free reference.
const NOW = new Date(2026, 0, 15, 10, 0).getTime();
const day = (d: number, h: number, m = 0): number => new Date(2026, 0, d, h, m).getTime();

const display: DisplayPrefs = { showId: false, showWeight: false, showReminders: false, filterMode: 'hide' };

const tree: Node = Tree.fromOps([
  { kind: 'add', parentId: ROOT_ID, id: 'a', name: 'alpha', weight: 1 },
  { kind: 'add', parentId: 'a', id: 'b', name: 'beta', weight: 1 },
]).getRoot();

const blk = (id: string, start: number, end: number, status = false, nodeId?: string): Block => ({
  id,
  name: id,
  start,
  end,
  note: '',
  status,
  nodeId,
});

function makeClient(blocks: Block[]): WorktreeClient & {
  addBlock: ReturnType<typeof vi.fn>;
  editBlock: ReturnType<typeof vi.fn>;
  removeBlock: ReturnType<typeof vi.fn>;
  setBlockCompleted: ReturnType<typeof vi.fn>;
} {
  return {
    getBlocks: () => blocks,
    addBlock: vi.fn(),
    editBlock: vi.fn(),
    removeBlock: vi.fn(),
    setBlockCompleted: vi.fn(),
  } as unknown as WorktreeClient & {
    addBlock: ReturnType<typeof vi.fn>;
    editBlock: ReturnType<typeof vi.fn>;
    removeBlock: ReturnType<typeof vi.fn>;
    setBlockCompleted: ReturnType<typeof vi.fn>;
  };
}

function renderPage(client: WorktreeClient, calendarDays = 3) {
  render(
    <I18nProvider lang="en">
      <FilterProvider filter={{}} mode="hide" setFilter={() => undefined} setMode={() => undefined}>
        <CalendarPage client={client} tree={tree} display={display} calendarDays={calendarDays} nowMs={NOW} />
      </FilterProvider>
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CalendarPage grid', () => {
  it('renders a bar at the block time and height', () => {
    renderPage(makeClient([blk('b1', day(15, 9), day(15, 10, 30))]));
    const bar = screen.getByTestId('block-b1');
    expect(bar.style.top).toBe(pct(9 * DEFAULT_PX_PER_HOUR));
    expect(bar.style.height).toBe(pct(1.5 * DEFAULT_PX_PER_HOUR));
    expect(bar.textContent).toContain('b1');
  });

  it('shows the linked node name in the bar', () => {
    renderPage(makeClient([blk('b1', day(15, 9), day(15, 10), false, 'a')]));
    expect(screen.getByTestId('block-b1').textContent).toContain('alpha');
  });

  it('colors bars from the palette and dims completed ones', () => {
    renderPage(
      makeClient([
        blk('b1', day(15, 9), day(15, 10), true),
        blk('b2', day(15, 11), day(15, 12), false),
      ]),
    );
    const done = screen.getByTestId('block-b1');
    const open = screen.getByTestId('block-b2');
    expect(done.style.opacity).toBe('0.5');
    expect(done.style.backgroundColor).not.toBe('');
    expect(done.className).not.toContain('bg-gray-400');
    expect(open.style.opacity).toBe('');
    expect(open.style.backgroundColor).not.toBe('');
  });

  it('highlights the today column header', () => {
    renderPage(makeClient([]));
    const header = screen.getByText('Thu 1/15');
    expect(header.className).toContain('text-blue-700');
    fireEvent.click(screen.getByTestId('calendar-next'));
    expect(screen.getByText('Fri 1/16')).toBeInTheDocument();
    expect(screen.getByText('Fri 1/16').className).not.toContain('text-blue-700');
  });

  it('navigates one day at a time and jumps back to today', () => {
    renderPage(makeClient([blk('b1', day(15, 9), day(15, 10))]), 3);
    expect(screen.getByTestId('block-b1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('calendar-next'));
    // one day forward: the block leaves the grid and the header moves to Jan 16
    expect(screen.queryByTestId('block-b1')).toBeNull();
    expect(screen.getByText('Fri 1/16')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('calendar-today'));
    expect(screen.getByTestId('block-b1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('calendar-prev'));
    expect(screen.getByText('Wed 1/14')).toBeInTheDocument();
  });

  it('jumps to a chosen day via the date input', () => {
    renderPage(makeClient([]), 3);
    fireEvent.change(screen.getByTestId('calendar-date'), { target: { value: '2026-01-20' } });
    expect(screen.getByText('Tue 1/20')).toBeInTheDocument();
    expect(screen.getByText('Wed 1/21')).toBeInTheDocument();
  });

  it('renders a midnight-crossing block as two per-day segments', () => {
    renderPage(makeClient([blk('b1', day(15, 22), day(16, 2))]));
    const [first, second] = screen.getAllByTestId('block-b1');
    // Sep 15 segment: 22:00–24:00 in column 0.
    expect(first.style.top).toBe(pct(22 * DEFAULT_PX_PER_HOUR));
    expect(first.style.height).toBe(pct(2 * DEFAULT_PX_PER_HOUR));
    expect(first.style.width).toBe(dayWidthCalc(1 / 3));
    // Sep 16 segment: 0:00–2:00 in column 1.
    expect(second.style.top).toBe('0%');
    expect(second.style.height).toBe(pct(2 * DEFAULT_PX_PER_HOUR));
  });
});

describe('CalendarPage block editing', () => {
  it('opens the panel when a bar is clicked and completes a block', () => {
    const client = makeClient([blk('b1', day(15, 9), day(15, 10))]);
    renderPage(client);
    fireEvent.click(screen.getByTestId('block-b1'));
    expect(screen.getByTestId('block-detail')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('block-complete'));
    expect(client.setBlockCompleted).toHaveBeenCalledWith('b1', true);
  });

  it('creates a block through the centered add modal', () => {
    const client = makeClient([]);
    renderPage(client);
    fireEvent.click(screen.getByTestId('calendar-add'));
    expect(screen.getByTestId('block-modal')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('block-name'), { target: { value: 'Sync' } });
    fireEvent.change(screen.getByTestId('block-start'), { target: { value: '2026-01-16T09:00:00' } });
    fireEvent.change(screen.getByTestId('block-end'), { target: { value: '2026-01-16T10:00:00' } });
    fireEvent.change(screen.getByTestId('block-note'), { target: { value: 'n' } });
    fireEvent.click(screen.getByTestId('block-save'));
    expect(client.addBlock).toHaveBeenCalledWith({
      name: 'Sync',
      start: day(16, 9),
      end: day(16, 10),
      note: 'n',
      nodeId: undefined,
    });
  });

  it('rejects an invalid time range before calling the client', () => {
    const client = makeClient([]);
    renderPage(client);
    fireEvent.click(screen.getByTestId('calendar-add'));
    fireEvent.change(screen.getByTestId('block-name'), { target: { value: 'Sync' } });
    fireEvent.change(screen.getByTestId('block-start'), { target: { value: '2026-01-16T10:00:00' } });
    fireEvent.change(screen.getByTestId('block-end'), { target: { value: '2026-01-16T09:00:00' } });
    fireEvent.click(screen.getByTestId('block-save'));
    expect(client.addBlock).not.toHaveBeenCalled();
    expect(screen.getByText(/Start must be before end/)).toBeInTheDocument();
  });

  it('edits a block through the panel', () => {
    const client = makeClient([blk('b1', day(15, 9), day(15, 10))]);
    renderPage(client);
    fireEvent.click(screen.getByTestId('block-b1'));
    fireEvent.change(screen.getByTestId('block-name'), { target: { value: 'renamed' } });
    fireEvent.click(screen.getByTestId('block-save'));
    expect(client.editBlock).toHaveBeenCalledWith('b1', expect.objectContaining({ name: 'renamed' }));
  });

  it('deletes a block with confirmation', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const client = makeClient([blk('b1', day(15, 9), day(15, 10))]);
    renderPage(client);
    fireEvent.click(screen.getByTestId('block-b1'));
    fireEvent.click(screen.getByTestId('block-delete'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(client.removeBlock).toHaveBeenCalledWith('b1');
  });

  it('links a node through the tree picker', () => {
    const client = makeClient([blk('b1', day(15, 9), day(15, 10))]);
    renderPage(client);
    fireEvent.click(screen.getByTestId('block-b1'));
    fireEvent.click(screen.getByTestId('block-link'));
    expect(screen.getByTestId('node-picker')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /beta/ }));
    expect(screen.queryByTestId('node-picker')).toBeNull();
    fireEvent.click(screen.getByTestId('block-save'));
    expect(client.editBlock).toHaveBeenCalledWith('b1', expect.objectContaining({ nodeId: 'b' }));
  });
});
