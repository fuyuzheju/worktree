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
}

function buildSnapshot(client: WorktreeClient): ClientSnapshot {
  return {
    client,
    tree: client.getTree(),
    online: client.isOnline(),
    conflict: client.getConflict(),
    pendingCount: client.getPendingCount(),
  };
}

/**
 * Creates the WorktreeClient for the current (serverUrl, user), connects it,
 * and mirrors every kernel emit into React state. `epoch` can be bumped to
 * force a fresh client (used by "clear local cache").
 */
export function useWorktreeClient(params: {
  serverUrl: string;
  user: string;
  epoch: number;
}): { snap: ClientSnapshot | null; error: string | null } {
  const { serverUrl, user, epoch } = params;

  const built = useMemo(() => {
    try {
      return {
        client: new WorktreeClient({
          serverUrl,
          user,
          local: user === LOCAL_USER,
          storage: new LocalStorageClientStorage(stateKey(serverUrl, user)),
        }),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [serverUrl, user, epoch]);

  const client = 'client' in built ? built.client : null;
  const error = 'client' in built ? null : built.error;

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
