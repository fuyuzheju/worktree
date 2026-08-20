import type { HistoryNode, HistoryOperation, HistoryPage } from '@worktree/core';
import { ApiError } from './api';
import type { ClientStore } from './store';

/** The server calls the syncer needs; ServerAPI satisfies this. */
export interface SyncAPI {
  submit(ops: HistoryOperation[]): Promise<void>;
  history(after: string | null): Promise<HistoryPage>;
  rewrite(base: string | null, history: HistoryNode[]): Promise<void>;
}

export interface Conflict {
  /** Last confirmed history node both sides agree on (null when histories diverged entirely). */
  baseId: string | null;
  serverBranch: HistoryNode[];
  localBranch: HistoryOperation[];
}

export type SyncResult = 'ok' | 'conflict' | 'offline';

/**
 * Sync engine: catch up first, flush pending ops, catch up again.
 * A 400 on submit is a conflict; 503 means the server is offline
 * (maintenance or another client rewriting) — keep the queue.
 */
export class Syncer {
  private conflict: Conflict | null = null;

  constructor(
    private store: ClientStore,
    private api: SyncAPI,
  ) {}

  getConflict(): Conflict | null {
    return this.conflict;
  }

  async sync(): Promise<SyncResult> {
    try {
      await this.catchUp();
      if (this.store.getPending().length > 0) {
        try {
          await this.api.submit(this.store.getPending());
          this.store.confirmAllPending();
        } catch (e) {
          if (e instanceof ApiError && e.status === 400) {
            this.conflict = await this.buildConflict();
            return 'conflict';
          }
          throw e;
        }
      }
      await this.catchUp();
      return 'ok';
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) return 'offline';
      throw e;
    }
  }

  async catchUp(): Promise<void> {
    const confirmed = this.store.getConfirmed();
    const headId = confirmed.at(-1)?.id ?? null;
    const { cursorFound, nodes } = await this.api.history(headId);
    if (headId !== null && !cursorFound) {
      // The server history was rewritten and no longer contains our cursor:
      // adopt it wholesale (also covers a rewrite to an empty history).
      this.store.setConfirmed(nodes);
      return;
    }
    for (const n of nodes) this.store.applyConfirmed(n);
  }

  async resolveConflict(choice: 'server' | 'local', chosenOps?: HistoryOperation[]): Promise<void> {
    if (choice === 'server') {
      this.store.clearPending();
      await this.catchUp();
    } else {
      // Re-catch-up first so non-conflicting server ops survive the rewrite,
      // then send the merged history guarded by the server's current head.
      // A 409 means the history advanced mid-merge: re-merge against the
      // fresh history (bounded retries).
      const keep = chosenOps ?? this.store.getPending();
      const keepNodes: HistoryNode[] = keep.map((p): HistoryNode => {
        if (p.kind !== 'add') throw new Error(`history operation '${p.kind}' is not supported`);
        return { id: p.id, op: p.op };
      });
      for (let attempt = 0; ; attempt++) {
        const serverHistory = (await this.api.history(null)).nodes;
        const history = [...serverHistory, ...keepNodes];
        const base = serverHistory.at(-1)?.id ?? null;
        try {
          await this.api.rewrite(base, history);
          this.store.setConfirmed(history);
          this.store.clearPending();
          break;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && attempt < 3) continue;
          throw e;
        }
      }
    }
    this.conflict = null;
  }

  private async buildConflict(): Promise<Conflict> {
    const confirmed = this.store.getConfirmed();
    const baseId = confirmed.at(-1)?.id ?? null;
    const serverBranch = (await this.api.history(baseId)).nodes;
    return { baseId, serverBranch, localBranch: this.store.getPending() };
  }
}
