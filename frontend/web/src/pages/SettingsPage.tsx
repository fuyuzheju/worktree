import { useState } from 'react';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { LOCAL_USER, listLoggedInUsers, loadToken } from '../config';
import type { AppConfig } from '../config';
import { authRequest } from '../auth';
import { useI18n } from '../i18n';
import { flattenTree } from '../tree-utils';

function validServerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SettingsPage(props: {
  config: AppConfig;
  client: WorktreeClient;
  tree: Node;
  updateConfig: (patch: Partial<AppConfig>) => void;
  onClearCache: () => void;
  onLogout: () => void;
  onLoginOther: () => void;
}) {
  const { t } = useI18n();
  const { config, client, tree, updateConfig, onClearCache, onLogout, onLoginOther } = props;

  const [serverDraft, setServerDraft] = useState(config.serverUrl);
  const [serverError, setServerError] = useState<string | null>(null);

  const applyServer = (): void => {
    const value = serverDraft.trim().replace(/\/+$/, '');
    if (!validServerUrl(value)) {
      setServerError(t('settings.invalidServer'));
      return;
    }
    setServerError(null);
    setServerDraft(value);
    updateConfig({ serverUrl: value });
  };

  const clearCache = (): void => {
    if (!window.confirm(t('settings.clearConfirm', { user: config.user, server: config.serverUrl }))) {
      return;
    }
    onClearCache();
  };

  const storedToken = config.user === LOCAL_USER ? null : loadToken(config.serverUrl, config.user);

  const logout = async (): Promise<void> => {
    const stored = storedToken;
    if (stored !== null) {
      try {
        // Best-effort server-side revocation; local state is cleared either way.
        await authRequest(config.serverUrl, '/api/logout', {}, stored.token);
      } catch (e) {
        console.warn('server-side logout failed:', e);
      }
    }
    onLogout();
  };

  const nodeCount = flattenTree(tree).length - 1;

  return (
    <div className="max-w-2xl space-y-4 text-sm">
      {storedToken !== null && (
        <section className="rounded border border-gray-300 bg-white p-4">
          <h2 className="font-semibold">{t('settings.account')}</h2>
          <p className="mt-1 text-gray-600">
            {t('settings.loggedIn', {
              user: config.user,
              label: storedToken.label ?? t('settings.noLabel'),
            })}
          </p>
        </section>
      )}

      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">{t('settings.user')}</h2>
        <p className="mt-1 text-gray-600">{t('settings.currentUser', { user: config.user })}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={config.user}
            onChange={(e) => updateConfig({ user: e.target.value })}
            data-testid="settings-user-select"
            className="w-56 max-w-full rounded border border-gray-300 px-2 py-1"
          >
            <option value={LOCAL_USER}>{t('settings.localUser')}</option>
            {listLoggedInUsers(config.serverUrl).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onLoginOther}
            data-testid="settings-login-other"
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
          >
            {t('settings.loginOther')}
          </button>
          {storedToken !== null && (
            <button
              type="button"
              onClick={() => void logout()}
              data-testid="settings-logout"
              className="rounded border border-red-300 bg-red-50 px-3 py-1 text-red-700 hover:bg-red-100"
            >
              {t('settings.logout')}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('settings.userNote')}</p>
      </section>

      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">{t('settings.serverUrl')}</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={serverDraft}
            onChange={(e) => setServerDraft(e.target.value)}
            data-testid="settings-server-input"
            className="w-full rounded border border-gray-300 px-2 py-1 font-mono"
          />
          <button
            type="button"
            onClick={applyServer}
            data-testid="settings-apply-server"
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
          >
            {t('settings.apply')}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('settings.serverNote')}</p>
        {serverError !== null && <p className="mt-1 text-xs text-red-700">{serverError}</p>}
      </section>

      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">{t('settings.display')}</h2>
        <div className="mt-2 flex flex-col gap-1.5">
          <Checkbox
            checked={config.display.showId}
            onChange={(v) => updateConfig({ display: { ...config.display, showId: v } })}
            label={t('settings.showId')}
          />
          <Checkbox
            checked={config.display.showWeight}
            onChange={(v) => updateConfig({ display: { ...config.display, showWeight: v } })}
            label={t('settings.showWeight')}
          />
          <Checkbox
            checked={config.display.showReminders}
            onChange={(v) => updateConfig({ display: { ...config.display, showReminders: v } })}
            label={t('settings.showReminders')}
          />
          <label className="mt-1 flex items-center gap-2">
            <span>{t('settings.filterMode')}</span>
            <select
              value={config.display.filterMode}
              onChange={(e) =>
                updateConfig({
                  display: { ...config.display, filterMode: e.target.value as 'hide' | 'highlight' },
                })
              }
              data-testid="settings-filter-mode"
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="hide">{t('settings.filterHide')}</option>
              <option value="highlight">{t('settings.filterHighlight')}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">{t('settings.language')}</h2>
        <select value={config.lang} className="mt-2 rounded border border-gray-300 px-2 py-1" disabled>
          <option value="en">English</option>
        </select>
      </section>

      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">{t('settings.data')}</h2>
        <dl className="mt-2 flex gap-6 text-gray-600">
          <div>
            <dt className="text-xs text-gray-500">{t('stats.nodeCount')}</dt>
            <dd className="font-mono">{nodeCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('settings.pendingCount')}</dt>
            <dd className="font-mono">{client.getPendingCount()}</dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={clearCache}
          data-testid="settings-clear-cache"
          className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-1 text-red-700 hover:bg-red-100"
        >
          {t('settings.clearCache')}
        </button>
      </section>
    </div>
  );
}

function Checkbox(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}
