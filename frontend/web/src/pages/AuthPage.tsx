import { useState } from 'react';
import { USER_RE } from '@worktree/core';
import type { StoredToken } from '../config';
import { AuthError, authRequest } from '../auth';
import { useI18n } from '../i18n';

export function AuthPage(props: {
  serverUrl: string;
  user: string;
  /** `username` is the server-confirmed identity — it may differ from `user`. */
  onAuthed: (username: string, token: StoredToken) => void;
  onUseLocal: () => void;
}) {
  const { t } = useI18n();
  const { serverUrl, user, onAuthed, onUseLocal } = props;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState(user);
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const name = username.trim();
    if (!USER_RE.test(name)) {
      setError(t('auth.invalidUser'));
      return;
    }
    if (password.length < 8) {
      setError(t('auth.shortPassword'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await authRequest(
        serverUrl,
        mode === 'login' ? '/api/login' : '/api/register',
        { username: name, password, ...(label.trim() === '' ? {} : { label: label.trim() }) },
      );
      onAuthed(res.username, { token: res.token, tokenId: res.tokenId, label: label.trim() || undefined });
    } catch (e) {
      if (e instanceof AuthError) {
        if (e.status === 401) setError(t('auth.invalidCredentials'));
        else if (e.status === 409) setError(t('auth.usernameTaken'));
        else setError(e.message);
      } else {
        setError(t('auth.networkError'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-96 rounded border border-gray-300 bg-white px-6 py-5 shadow-sm">
        <h1 className="text-lg font-semibold">{t('auth.title')}</h1>
        <p className="mt-1 text-xs text-gray-500">{serverUrl}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            data-testid="auth-mode-login"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`rounded px-3 py-1 text-sm ${
              mode === 'login' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white hover:bg-gray-50'
            }`}
          >
            {t('auth.login')}
          </button>
          <button
            type="button"
            data-testid="auth-mode-register"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`rounded px-3 py-1 text-sm ${
              mode === 'register' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white hover:bg-gray-50'
            }`}
          >
            {t('auth.register')}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-sm">
            {t('auth.username')}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid="auth-username"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            {t('auth.password')}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="auth-password"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            {t('auth.label')}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('auth.labelPlaceholder')}
              data-testid="auth-label"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
        </div>
        {error !== null && (
          <p className="mt-2 text-xs text-red-700" data-testid="auth-error">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          data-testid="auth-submit"
          className="mt-3 w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? t('auth.busy') : mode === 'login' ? t('auth.login') : t('auth.register')}
        </button>
        <button
          type="button"
          onClick={onUseLocal}
          data-testid="auth-use-local"
          className="mt-2 w-full rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
        >
          {t('auth.useLocal')}
        </button>
      </div>
    </div>
  );
}
