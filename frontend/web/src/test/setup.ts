import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL's auto-cleanup needs a global afterEach, which vitest doesn't provide
// without `globals: true` — register it explicitly.
afterEach(() => {
  cleanup();
});

// Node 25 exposes a stub `localStorage` global that shadows jsdom's Storage,
// leaving window.localStorage without getItem/setItem. Install a working
// in-memory Storage on both globals so browser-targeting code works in tests.
class MemoryStorage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const storage = new MemoryStorage() as unknown as Storage;
for (const target of [globalThis, window]) {
  Object.defineProperty(target, 'localStorage', { value: storage, configurable: true });
}
