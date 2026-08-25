import { useEffect, useMemo, useState } from 'react';
import { WorktreeClient } from '@worktree/client';
import type { Conflict } from '@worktree/client';
import type { Node } from '@worktree/core';
import { LOCAL_USER, stateKey } from '../config';
import { LocalStorageClientStorage } from '../storage';

export interface ClientSnapshot {
  client: WorktreeClient;
  tree: Node;
  online: boolean;
  conflict: Conflict | null;
  pendingCount: number;
  authFailed: boolean;
}

function buildSnapshot(client: WorktreeClient): ClientSnapshot {
  return {
    client,
    tree: client.getTree(),
    online: client.isOnline(),
    conflict: client.getConflict(),
    pendingCount: client.getPendingCount(),
    authFailed: client.isAuthFailed(),
  };
}

/**
 * Creates the WorktreeClient for the current (serverUrl, user), connects it,
 * and mirrors every kernel emit into React state. `epoch` can be bumped to
 * force a fresh client (used by "clear local cache"). Server users without
 * a token yield a null snap (the caller shows the login screen instead).
 */
export function useWorktreeClient(params: {
  serverUrl: string;
  user: string;
  token: string | null;
  epoch: number;
}): { snap: ClientSnapshot | null; error: string | null } {
  const { serverUrl, user, token, epoch } = params;

  const built = useMemo((): { client: WorktreeClient | null; error: string | null } => {
    if (user !== LOCAL_USER && token === null) return { client: null, error: null };
    try {
      return {
        client: new WorktreeClient({
          serverUrl,
          user,
          token: token ?? undefined,
          local: user === LOCAL_USER,
          storage: new LocalStorageClientStorage(stateKey(serverUrl, user)),
        }),
        error: null,
      };
    } catch (e) {
      return { client: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [serverUrl, user, token, epoch]);

  const { client, error } = built;

  const [snap, setSnap] = useState<ClientSnapshot | null>(() =>
    client ? buildSnapshot(client) : null,
  );

  useEffect(() => {
    if (!client) return;
    const update = (): void => setSnap(buildSnapshot(client));
    const unsubscribe = client.subscribe(update);
    update();
    client.connect();
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [client]);

  return { snap, error };
}
