export const DEFAULT_SERVER = 'http://localhost:3000';
export const LOCAL_USER = 'local';

export interface DisplayPrefs {
  showId: boolean;
  showWeight: boolean;
  showReminders: boolean;
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
  display: { showId: true, showWeight: true, showReminders: true },
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
