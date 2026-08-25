import { useEffect, useState } from 'react';
import { AppConfig, LOCAL_USER, clearToken, loadConfig, loadToken, saveConfig, saveToken, stateKey } from './config';
import type { StoredToken } from './config';
import { useWorktreeClient } from './hooks/useWorktreeClient';
import { I18nProvider, useI18n } from './i18n';
import { StatusBar } from './components/StatusBar';
import { Tabs } from './components/Tabs';
import { TreePage } from './pages/TreePage';
import { StatsPage } from './pages/StatsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ConflictPage } from './pages/ConflictPage';
import { AuthPage } from './pages/AuthPage';

export type Tab = 'tree' | 'stats' | 'settings';

export default function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const [tab, setTab] = useState<Tab>('tree');
  const [clientEpoch, setClientEpoch] = useState(0);
  // Explicitly requested login screen ("log in another user"); the only way
  // to reach the auth page while a valid token exists.
  const [showAuth, setShowAuth] = useState(false);

  const token = config.user === LOCAL_USER ? null : loadToken(config.serverUrl, config.user)?.token ?? null;

  const { snap, error } = useWorktreeClient({
    serverUrl: config.serverUrl,
    user: config.user,
    token,
    epoch: clientEpoch,
  });

  const updateConfig = (patch: Partial<AppConfig>): void => {
    const next = { ...config, ...patch };
    saveConfig(next);
    setConfig(next);
  };

  const clearCache = (): void => {
    try {
      localStorage.removeItem(stateKey(config.serverUrl, config.user));
    } catch (e) {
      console.error('failed to clear cache:', e);
    }
    setClientEpoch((e) => e + 1);
  };

  const onAuthed = (username: string, stored: StoredToken): void => {
    // The server-confirmed username is authoritative: the user may have typed
    // a different name than config.user, and the token belongs to the former.
    saveToken(config.serverUrl, username, stored);
    updateConfig({ user: username });
    setShowAuth(false);
    setClientEpoch((e) => e + 1);
  };

  /** After logout (or a revoked-token relogin): back to the offline user. */
  const logout = (): void => {
    clearToken(config.serverUrl, config.user);
    updateConfig({ user: LOCAL_USER });
    setClientEpoch((e) => e + 1);
  };

  /** The current token is dead: clear it and ask for fresh credentials. */
  const relogin = (): void => {
    clearToken(config.serverUrl, config.user);
    setShowAuth(true);
    setClientEpoch((e) => e + 1);
  };

  if (error) {
    return <ErrorScreen message={error} />;
  }

  const needsAuth = config.user !== LOCAL_USER && token === null;
  if (needsAuth || showAuth) {
    return (
      <I18nProvider lang={config.lang}>
        <AuthPage
          serverUrl={config.serverUrl}
          user={config.user}
          onAuthed={onAuthed}
          onUseLocal={() => {
            updateConfig({ user: LOCAL_USER });
            setShowAuth(false);
          }}
        />
      </I18nProvider>
    );
  }
  if (!snap) return null;

  return (
    <I18nProvider lang={config.lang}>
      {snap.conflict !== null ? (
        <ConflictPage conflict={snap.conflict} client={snap.client} display={config.display} />
      ) : (
        <Shell
          config={config}
          tab={tab}
          setTab={setTab}
          snap={snap}
          updateConfig={updateConfig}
          clearCache={clearCache}
          onLogout={logout}
          onLoginOther={() => setShowAuth(true)}
        />
      )}
    </I18nProvider>
  );
}

function Shell(props: {
  config: AppConfig;
  tab: Tab;
  setTab: (tab: Tab) => void;
  snap: NonNullable<ReturnType<typeof useWorktreeClient>['snap']>;
  updateConfig: (patch: Partial<AppConfig>) => void;
  clearCache: () => void;
  onLogout: () => void;
  onLoginOther: () => void;
}) {
  const { t } = useI18n();
  const { config, tab, setTab, snap, updateConfig, clearCache, onLogout, onLoginOther } = props;
  const { client, tree, online, pendingCount, authFailed } = snap;

  // Deep link from a notification click: ?node=<id> on first load, or a
  // worktree-open-node message from the service worker while running.
  const [initialNodeId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('node'),
  );
  const [focusNode, setFocusNode] = useState<{ id: string; nonce: number } | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type !== 'worktree-open-node' || typeof data.url !== 'string') return;
      const node = new URL(data.url, window.location.origin).searchParams.get('node');
      if (node === null) return;
      setTab('tree');
      setFocusNode({ id: node, nonce: Date.now() });
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [setTab]);

  return (
    <div className="flex flex-col min-h-screen max-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-300 bg-white px-4 py-3 md:px-6">
        <div className="flex flex-wrap max-md:flex-col items-start justify-between gap-2">
          <h1 className="text-xl font-bold tracking-wide">{t('app.title')}</h1>
          <StatusBar
            online={online}
            pendingCount={pendingCount}
            client={client}
            authFailed={authFailed}
            onRelogin={onLogout}
          />
        </div>
        <Tabs active={tab} onChange={setTab} />
      </header>
      <main className="py-4 md:px-6 flex-1 flex w-full min-h-0 overflow-y-auto">
        {tab === 'tree' && (
          <TreePage
            tree={tree}
            client={client}
            display={config.display}
            updateConfig={updateConfig}
            initialNodeId={initialNodeId ?? undefined}
            focusNode={focusNode}
          />
        )}
        {tab === 'stats' && <StatsPage client={client} />}
        {tab === 'settings' && (
          <SettingsPage
            config={config}
            client={client}
            tree={tree}
            updateConfig={updateConfig}
            onClearCache={clearCache}
            onLogout={onLogout}
            onLoginOther={onLoginOther}
          />
        )}
      </main>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  const [user, setUser] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  const recover = (): void => {
    const current = loadConfig();
    saveConfig({
      ...current,
      user: user.trim() === '' ? LOCAL_USER : user.trim(),
      serverUrl: serverUrl.trim() === '' ? current.serverUrl : serverUrl.trim(),
    });
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-96 rounded border border-red-300 bg-red-50 px-6 py-4 text-red-800">
        <p className="font-semibold">Worktree could not start</p>
        <p className="mt-1 text-sm">{message}</p>
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-sm">
            Username
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder={loadConfig().user}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-gray-900"
            />
          </label>
          <label className="text-sm">
            Server URL
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder={loadConfig().serverUrl}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-gray-900"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={recover}
          className="mt-3 rounded bg-red-700 px-3 py-1.5 text-sm text-white hover:bg-red-800"
        >
          Apply and reload
        </button>
      </div>
    </div>
  );
}
