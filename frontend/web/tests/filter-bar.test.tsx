import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { NodeFilter } from '@worktree/core';
import { I18nProvider } from '../src/i18n';
import { FilterBar } from '../src/components/FilterBar';
import type { FilterDisplayMode } from '../src/config';

function Harness({ onFilterChange, onModeChange }: { onFilterChange?: (f: NodeFilter) => void; onModeChange?: (m: string) => void }) {
  const [filter, setFilter] = useState<NodeFilter>({});
  const [mode, setMode] = useState<FilterDisplayMode>('hide');
  return (
    <I18nProvider lang="en">
      <FilterBar
        filter={filter}
        mode={mode}
        onFilterChange={(f) => {
          setFilter(f);
          onFilterChange?.(f);
        }}
        onModeChange={(m) => {
          setMode(m);
          onModeChange?.(m);
        }}
      />
    </I18nProvider>
  );
}

const openPanel = (): void => {
  fireEvent.click(screen.getByTestId('filter-toggle'));
};

describe('FilterBar', () => {
  it('shows the controls only after the toggle is clicked', () => {
    render(<Harness />);
    expect(screen.queryByTestId('filter-keyword')).toBeNull();
    openPanel();
    expect(screen.getByTestId('filter-keyword')).toBeTruthy();
    fireEvent.click(screen.getByTestId('filter-toggle'));
    expect(screen.queryByTestId('filter-keyword')).toBeNull();
  });

  it('emits the keyword on input and undefined when cleared', () => {
    const onFilterChange = vi.fn();
    render(<Harness onFilterChange={onFilterChange} />);
    openPanel();
    fireEvent.change(screen.getByTestId('filter-keyword'), { target: { value: 'milk' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ keyword: 'milk' });
    fireEvent.change(screen.getByTestId('filter-keyword'), { target: { value: '' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ keyword: undefined });
  });

  it('emits the overdue flag from the checkbox', () => {
    const onFilterChange = vi.fn();
    render(<Harness onFilterChange={onFilterChange} />);
    openPanel();
    fireEvent.click(screen.getByTestId('filter-overdue'));
    expect(onFilterChange).toHaveBeenLastCalledWith({ overdue: true });
  });

  it('emits the completion status from the select', () => {
    const onFilterChange = vi.fn();
    render(<Harness onFilterChange={onFilterChange} />);
    openPanel();
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'true' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ status: true });
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'false' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ status: false });
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: '' } });
    expect(onFilterChange).toHaveBeenLastCalledWith({ status: undefined });
  });

  it('emits datetime bounds converted to epoch ms', () => {
    const onFilterChange = vi.fn();
    render(<Harness onFilterChange={onFilterChange} />);
    openPanel();
    fireEvent.change(screen.getByTestId('filter-deadline-before'), {
      target: { value: '2026-09-01T10:00' },
    });
    expect(onFilterChange).toHaveBeenLastCalledWith({
      deadlineBefore: new Date('2026-09-01T10:00').getTime(),
    });
  });

  it('emits the display mode from the select', () => {
    const onModeChange = vi.fn();
    render(<Harness onModeChange={onModeChange} />);
    openPanel();
    fireEvent.change(screen.getByTestId('filter-mode'), { target: { value: 'highlight' } });
    expect(onModeChange).toHaveBeenCalledWith('highlight');
  });
});
