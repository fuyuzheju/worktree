import type { ClientStorage, SavedState } from '@worktree/client';

/**
 * localStorage-backed ClientStorage. Namespacing per (server, user) is the
 * caller's job (see stateKey in config.ts). A corrupt or misshapen entry is
 * treated as absent — the kernel then starts from an empty history.
 */
export class LocalStorageClientStorage implements ClientStorage {
  constructor(private key: string) {}

  load(): SavedState | null {
    let raw: string;
    try {
      raw = localStorage.getItem(this.key) ?? '';
    } catch (e) {
      console.error('failed to read state:', e);
      return null;
    }
    if (raw === '') return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SavedState>;
      if (!Array.isArray(parsed.confirmed) || !Array.isArray(parsed.pending)) return null;
      return { confirmed: parsed.confirmed, pending: parsed.pending };
    } catch (e) {
      console.error('state was corrupt — starting fresh:', e);
      return null;
    }
  }

  save(state: SavedState): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch (e) {
      console.error('failed to save state:', e);
    }
  }
}
