import { useState } from 'react';
import type { WorktreeClient } from '@worktree/client';
import { useI18n } from '../i18n';

export function StatusBar(props: {
  online: boolean;
  pendingCount: number;
  client: WorktreeClient;
  authFailed?: boolean;
  onRelogin?: () => void;
}) {
  const { t } = useI18n();
  const { online, pendingCount, client, authFailed = false, onRelogin } = props;
  const [reconnecting, setReconnecting] = useState(false);

  const pending = client.getPending();
  const removeCount = pending.filter((p) => p.kind === 'remove').length;
  const canUndo = pending.some((p) => p.kind === 'add') || client.getConfirmed().length > removeCount;

  const onReconnect = async (): Promise<void> => {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      await client.reconnect();
    } catch (e) {
      console.error('reconnect failed:', e);
    } finally {
      setReconnecting(false);
    }
  };

  const onUndo = (): void => {
    try {
      client.undo();
    } catch (e) {
      console.error('undo failed:', e);
    }
  };

  if (authFailed) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
          <span className="text-amber-800">{t('status.unauthorized')}</span>
        </span>
        {onRelogin !== undefined && (
          <button
            type="button"
            onClick={onRelogin}
            data-testid="status-relogin"
            className="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50"
          >
            {t('status.loginAgain')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
          aria-hidden
        />
        <span className="text-gray-600">{online ? t('status.online') : t('status.offline')}</span>
      </span>
      {pendingCount > 0 && (
        <span className="text-amber-700">{t('status.pending', { n: pendingCount })}</span>
      )}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        data-testid="status-undo"
        className="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
      >
        {t('status.undo')}
      </button>
      {!online && !client.isLocal() && (
        <button
          type="button"
          onClick={() => void onReconnect()}
          disabled={reconnecting}
          data-testid="status-reconnect"
          className="rounded border border-gray-300 bg-white px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
        >
          {reconnecting ? t('status.reconnecting') : t('status.reconnect')}
        </button>
      )}
    </div>
  );
}
