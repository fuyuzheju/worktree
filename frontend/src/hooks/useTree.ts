import { useEffect, useState } from 'react';
import type { WorktreeClient } from '@worktree/client';
import type { Node } from '@worktree/core';

/**
 * The tree always comes from the client. The tick forces a re-render even
 * when the tree object is unchanged (e.g. online/offline transitions).
 */
export function useTree(client: WorktreeClient): Node {
  const [snapshot, setSnapshot] = useState(() => ({ tree: client.getTree(), tick: 0 }));
  useEffect(() => {
    return client.subscribe((tree) => setSnapshot((prev) => ({ tree, tick: prev.tick + 1 })));
  }, [client]);
  return snapshot.tree;
}
