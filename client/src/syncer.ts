import { Tree } from '@worktree/core';
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
  /** Frozen snapshot of the confirmed history before the failed catch-up. */
  base: HistoryNode[];
  /** Last entry of `base`; null when there was no confirmed history. */
  baseId: string | null;
  /** True when `base` is still a prefix of the server history (server tree = base + serverBranch). */
  cursorFound: boolean;
  /** Server ops after `base`; the whole server history when the cursor was gone. */
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
      // Snapshot before catch-up: the conflict branches must diverge here,
      // not at the post-catch-up head (where the server branch would be empty).
      const base = this.store.getConfirmed();
      await this.catchUp();
      if (this.store.getPending().length > 0) {
        try {
          await this.api.submit(this.store.getPending());
          this.store.confirmAllPending();
        } catch (e) {
          if (e instanceof ApiError && e.status === 400) {
            // A rejected undo can never apply (the server only undoes its
            // head): a pure-remove queue is dropped instead of surfacing a
            // conflict that has nothing to show.
            if (this.store.getPending().every((p) => p.kind === 'remove')) {
              this.store.clearPending();
            } else {
              this.conflict = await this.buildConflict(base);
              return 'conflict';
            }
          } else {
            throw e;
          }
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
      // Keeping the local version discards the server's branch: with a
      // conflict the rewrite starts from the agreed base (what the "your
      // version" view shows); without one it merges onto the current server
      // history. Pending ops that do not replay on that history are dropped
      // so the rewritten history stays clean.
      const keep = chosenOps ?? this.conflict?.localBranch ?? this.store.getPending();
      for (let attempt = 0; ; attempt++) {
        const serverHistory = (await this.api.history(null)).nodes;
        const history = this.conflict ? [...this.conflict.base] : [...serverHistory];
        for (const p of keep) {
          if (p.kind === 'add') {
            const probe = Tree.fromOps(history.map((n) => n.op));
            try {
              probe.apply(p.op);
            } catch {
              continue;
            }
            history.push({ id: p.id, op: p.op });
          } else if (history.at(-1)?.id === p.id) {
            history.pop();
          }
        }
        // The rewrite guard is the server's current head; a 409 means it
        // advanced mid-merge — retry against the same agreed base.
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

  private async buildConflict(base: HistoryNode[]): Promise<Conflict> {
    const baseId = base.at(-1)?.id ?? null;
    const { cursorFound, nodes } = await this.api.history(baseId);
    return { base, baseId, cursorFound, serverBranch: nodes, localBranch: this.store.getPending() };
  }
}
