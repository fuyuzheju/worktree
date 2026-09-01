import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { NodeFilter } from '@worktree/core';
import type { FilterDisplayMode } from './config';

export interface FilterContextValue {
  filter: NodeFilter;
  mode: FilterDisplayMode;
  setFilter: (filter: NodeFilter) => void;
  setMode: (mode: FilterDisplayMode) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

/** App-level filter state: persisted in AppConfig, shared by tree and picker views. */
export function FilterProvider({
  filter,
  mode,
  setFilter,
  setMode,
  children,
}: FilterContextValue & { children: ReactNode }) {
  return (
    <FilterContext.Provider value={{ filter, mode, setFilter, setMode }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (ctx === null) throw new Error('useFilter must be used within a FilterProvider');
  return ctx;
}
