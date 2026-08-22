import { useEffect, useState } from 'react';

/**
 * Tracks a media query. Returns false when matchMedia is unavailable
 * (jsdom tests, older browsers) — callers then render the desktop layout.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);

  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (mql === undefined) return;
    const onChange = (e: MediaQueryListEvent): void => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
