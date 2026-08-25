import { USER_RE } from '@worktree/core';

export const DEFAULT_SERVER = 'https://worktree.fuyuzheju.cn';
export const LOCAL_USER = 'local';

/** How an active filter renders: hide non-matching nodes, or highlight matches. */
export type FilterDisplayMode = 'hide' | 'highlight';

export interface DisplayPrefs {
  showId: boolean;
  showWeight: boolean;
  showReminders: boolean;
  filterMode: FilterDisplayMode;
}

export interface AppConfig {
  serverUrl: string;
  user: string;
  display: DisplayPrefs;
  lang: string;
}

const CONFIG_KEY = 'worktree.config';

const defaultConfig: AppConfig = {
  serverUrl: DEFAULT_SERVER,
  user: LOCAL_USER,
  display: { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' },
  lang: 'en',
};

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return defaultConfig;
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      display: { ...defaultConfig.display, ...parsed.display },
    };
  } catch {
    return defaultConfig;
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('failed to save config:', e);
  }
}

/**
 * The ClientStorage namespace, mirroring the CLI's per (server, user) state
 * layout: the reserved user `local` is device-local and server-independent.
 */
export function stateKey(serverUrl: string, user: string): string {
  if (user === LOCAL_USER) return 'worktree.state.local';
  const host = new URL(serverUrl).host.replace(/[^a-zA-Z0-9.-]/g, '_');
  const sanitized = user.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `worktree.state.${host}.${sanitized}`;
}

/** A device token as issued by register/login. */
export interface StoredToken {
  token: string;
  tokenId: number;
  label?: string;
}

export function tokenKey(serverUrl: string, user: string): string {
  const host = new URL(serverUrl).host.replace(/[^a-zA-Z0-9.-]/g, '_');
  const sanitized = user.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `worktree.token.${host}.${sanitized}`;
}

export function loadToken(serverUrl: string, user: string): StoredToken | null {
  try {
    const raw = localStorage.getItem(tokenKey(serverUrl, user));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    if (typeof parsed.token !== 'string' || parsed.token.length === 0 || typeof parsed.tokenId !== 'number') {
      return null;
    }
    return { token: parsed.token, tokenId: parsed.tokenId, label: parsed.label };
  } catch {
    return null;
  }
}

export function saveToken(serverUrl: string, user: string, stored: StoredToken): void {
  try {
    localStorage.setItem(tokenKey(serverUrl, user), JSON.stringify(stored));
  } catch (e) {
    console.error('failed to save token:', e);
  }
}

export function clearToken(serverUrl: string, user: string): void {
  try {
    localStorage.removeItem(tokenKey(serverUrl, user));
  } catch (e) {
    console.error('failed to clear token:', e);
  }
}

/**
 * All users logged in on this device for the given server (i.e. with a
 * stored token). Usernames are USER_RE-valid, so the sanitized key suffix
 * is always the exact name.
 */
export function listLoggedInUsers(serverUrl: string): string[] {
  const host = new URL(serverUrl).host.replace(/[^a-zA-Z0-9.-]/g, '_');
  const prefix = `worktree.token.${host}.`;
  const users: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null || !key.startsWith(prefix)) continue;
      const name = key.slice(prefix.length);
      if (USER_RE.test(name)) users.push(name);
    }
  } catch (e) {
    console.error('failed to list tokens:', e);
  }
  return users.sort();
}
