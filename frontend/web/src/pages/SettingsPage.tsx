import { useState } from 'react';
import { USER_RE } from '@worktree/core';
import type { Node } from '@worktree/core';
import type { WorktreeClient } from '@worktree/client';
import { LOCAL_USER } from '../config';
import type { AppConfig } from '../config';
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
}) {
  const { t } = useI18n();
  const { config, client, tree, updateConfig, onClearCache } = props;

  const [userDraft, setUserDraft] = useState(config.user);
  const [serverDraft, setServerDraft] = useState(config.serverUrl);
  const [userError, setUserError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const switchUser = (): void => {
    const name = userDraft.trim();
    if (!USER_RE.test(name)) {
      setUserError(t('settings.invalidUser'));
      return;
    }
    setUserError(null);
    updateConfig({ user: name });
  };

  const useLocalUser = (): void => {
    setUserError(null);
    setUserDraft(LOCAL_USER);
    updateConfig({ user: LOCAL_USER });
  };

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

  const nodeCount = flattenTree(tree).length - 1;

  return (
    <div className="max-w-2xl space-y-4 text-sm">
      <section className="rounded border border-gray-300 bg-white p-4">
        <h2 className="font-semibold">{t('settings.user')}</h2>
        <p className="mt-1 text-gray-600">{t('settings.currentUser', { user: config.user })}</p>
        <p className="mt-1 text-xs text-gray-500">{t('settings.userNote')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={userDraft}
            onChange={(e) => setUserDraft(e.target.value)}
            data-testid="settings-user-input"
            className="w-56 max-w-full rounded border border-gray-300 px-2 py-1"
          />
          <button
            type="button"
            onClick={switchUser}
            data-testid="settings-switch-user"
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700"
          >
            {t('settings.switch')}
          </button>
          <button
            type="button"
            onClick={useLocalUser}
            className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50"
          >
            {t('settings.useLocal')}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('settings.localNote')}</p>
        {userError !== null && <p className="mt-1 text-xs text-red-700">{userError}</p>}
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
