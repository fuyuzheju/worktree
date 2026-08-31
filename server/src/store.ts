import { Tree, WorktreeState } from '@worktree/core';
import type { HistoryNode, HistoryOperation, Operation } from '@worktree/core';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { validateOps } from './validation';
import type { ValidationResult } from './validation';

const asJson = (op: Operation): Prisma.InputJsonValue => op as unknown as Prisma.InputJsonValue;

export class BaseMismatchError extends Error {
  constructor(
    public headId: string | null,
    public base: string | null,
  ) {
    super(`rewrite base ${base} does not match head ${headId}`);
  }
}

export class DuplicateOpError extends Error {
  constructor(public id: string) {
    super(`history node ${id} already exists with a different op`);
  }
}

export class HeadUndoError extends Error {
  constructor(
    public id: string,
    public headId: string | null,
  ) {
    super(`can only undo the head ${headId}, got ${id}`);
  }
}

export class ValidationError extends Error {
  constructor(
    public opId: string,
    public reason: string,
  ) {
    super(`op ${opId} is invalid: ${reason}`);
  }
}

export class UnknownUserError extends Error {
  constructor(public name: string) {
    super(`unknown user: ${name}`);
  }
}

/** What an appendBatch actually appended (duplicates are skipped). */
export interface AppendResult {
  added: HistoryNode[];
  removed: string[];
}

/** Server-side history: per-user Prisma persistence + the derived states. */
export class HistoryStore {
  private states = new Map<number, WorktreeState>();
  private userIds = new Map<string, number>();
  private queue: Promise<unknown> = Promise.resolve();

  /** Load persisted history into memory. Call once at boot. */
  async load(): Promise<void> {
    const users = await prisma.user.findMany();
    this.userIds = new Map(users.map((u) => [u.name, u.id]));
    this.states = new Map();
    for (const u of users) {
      this.states.set(u.id, await this.loadUserState(u.id));
    }
  }

  private async loadUserState(userId: number): Promise<WorktreeState> {
    const rows = await prisma.historyNode.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    const state = new WorktreeState();
    for (const row of rows) state.apply(row.op as unknown as Operation);
    return state;
  }

  /**
   * Resolve a username to its row id. Users are only created via
   * /api/register — the auth middleware guarantees the caller exists.
   */
  private async resolveUserId(name: string): Promise<number> {
    const cached = this.userIds.get(name);
    if (cached !== undefined) return cached;
    const user = await prisma.user.findUnique({ where: { name } });
    if (!user) throw new UnknownUserError(name);
    this.userIds.set(name, user.id);
    return user.id;
  }

  private getState(userId: number): WorktreeState {
    let state = this.states.get(userId);
    if (!state) {
      state = new WorktreeState();
      this.states.set(userId, state);
    }
    return state;
  }

  async getTreeForUser(user: string): Promise<WorktreeState> {
    return this.getState(await this.resolveUserId(user));
  }

  /** Snapshot of every loaded user's state, for the reminder sweeper. */
  allUserTrees(): Array<{ userId: number; tree: Tree }> {
    return [...this.states.entries()].map(([userId, state]) => ({ userId, tree: state.tree }));
  }

  /**
   * Serialize history mutations so validate → append is atomic per batch
   * even across concurrent requests.
   */
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Resolves once all submitted batches (including ones arriving mid-drain) have settled. */
  async drain(): Promise<void> {
    for (;;) {
      const current = this.queue;
      await current.catch(() => undefined);
      if (this.queue === current) return;
    }
  }

  /**
   * Append a batch atomically for one user. Duplicate ids with the same op
   * are skipped (idempotent retry); a duplicate id with a different op is
   * rejected. `remove` undoes the user's current head.
   * Validation runs inside the exclusive section so validate → append is
   * atomic even under concurrent requests.
   */
  async appendBatch(user: string, ops: HistoryOperation[]): Promise<AppendResult> {
    const userId = await this.resolveUserId(user);
    return this.exclusive(async () => {
      // Idempotent retry: ops whose ids are already in the history are skipped
      // (same op) or rejected (different op) before anything is validated.
      const existingIds = new Set<string>();
      for (const op of ops) {
        if (op.kind === 'remove') continue;
        const existing = await prisma.historyNode.findUnique({
          where: { userId_opId: { userId, opId: op.id } },
        });
        if (!existing) continue;
        if (JSON.stringify(existing.op) !== JSON.stringify(op.op)) throw new DuplicateOpError(op.id);
        existingIds.add(op.id);
      }
      const validation = await this.validateBatch(
        userId,
        ops.filter((op) => op.kind === 'remove' || !existingIds.has(op.id)),
      );
      if (!validation.ok) throw new ValidationError(validation.opId, validation.reason);
      const added: HistoryNode[] = [];
      const removed: string[] = [];
      await prisma.$transaction(async (tx) => {
        for (const op of ops) {
          if (op.kind === 'remove') {
            const row = await tx.historyNode.findUnique({
              where: { userId_opId: { userId, opId: op.id } },
            });
            // Already removed (idempotent retry, concurrent undo of the same head): no-op.
            if (!row) continue;
            const userRow = await tx.user.findUnique({ where: { id: userId } });
            const headId = userRow?.headOpId ?? null;
            if (headId !== op.id) throw new HeadUndoError(op.id, headId);
            await tx.historyNode.delete({ where: { userId_opId: { userId, opId: op.id } } });
            await tx.user.update({ where: { id: userId }, data: { headOpId: row.parentOpId } });
            removed.push(op.id);
            continue;
          }
          const existing = await tx.historyNode.findUnique({
            where: { userId_opId: { userId, opId: op.id } },
          });
          if (existing) {
            if (JSON.stringify(existing.op) !== JSON.stringify(op.op)) throw new DuplicateOpError(op.id);
            continue;
          }
          const userRow = await tx.user.findUnique({ where: { id: userId } });
          const headId = userRow?.headOpId ?? null;
          await tx.historyNode.create({
            data: { userId, opId: op.id, parentOpId: headId, op: asJson(op.op) },
          });
          await tx.user.update({ where: { id: userId }, data: { headOpId: op.id } });
          added.push({ id: op.id, op: op.op });
        }
      });
      if (removed.length > 0) {
        this.states.set(userId, await this.loadUserState(userId));
      } else {
        const state = this.getState(userId);
        for (const n of added) state.apply(n.op);
      }
      return { added, removed };
    });
  }

  /**
   * Validate a batch against the tree as it stands after the batch's removes.
   * Batches without removes take the fast tree-clone path; batches with
   * removes simulate the whole batch against the current history so an add
   * cannot depend on an entry its own batch undoes.
   */
  private async validateBatch(userId: number, ops: HistoryOperation[]): Promise<ValidationResult> {
    if (!ops.some((op) => op.kind === 'remove')) {
      return validateOps(ops, this.getState(userId));
    }
    const remaining = await this.allByUserId(userId);
    let headId = remaining.at(-1)?.id ?? null;
    let probe = WorktreeState.fromOps(remaining.map((n) => n.op));
    for (const op of ops) {
      if (op.kind === 'remove') {
        const idx = remaining.findIndex((n) => n.id === op.id);
        if (idx === -1) continue; // already removed: idempotent retry
        if (idx !== remaining.length - 1) throw new HeadUndoError(op.id, headId);
        remaining.pop();
        headId = remaining.at(-1)?.id ?? null;
        probe = WorktreeState.fromOps(remaining.map((n) => n.op));
        continue;
      }
      try {
        probe.apply(op.op);
      } catch (e) {
        return { ok: false, opId: op.id, reason: e instanceof Error ? e.message : String(e) };
      }
      remaining.push({ id: op.id, op: op.op });
      headId = op.id;
    }
    return { ok: true };
  }

  /**
   * The user's chain after (exclusive) cursorId; a cursor that is unknown
   * or belongs to another user yields the whole chain with cursorFound=false.
   */
  async since(user: string, cursorId: string | null): Promise<{ cursorFound: boolean; nodes: HistoryNode[] }> {
    const userId = await this.resolveUserId(user);
    if (cursorId === null) {
      return { cursorFound: true, nodes: await this.allByUserId(userId) };
    }
    const cursor = await prisma.historyNode.findUnique({
      where: { userId_opId: { userId, opId: cursorId } },
    });
    if (!cursor) {
      return { cursorFound: false, nodes: await this.allByUserId(userId) };
    }
    const rows = await prisma.historyNode.findMany({
      where: { userId, id: { gt: cursor.id } },
      orderBy: { id: 'asc' },
    });
    return {
      cursorFound: true,
      nodes: rows.map((row) => ({ id: row.opId, op: row.op as unknown as Operation })),
    };
  }

  async getById(user: string, id: string): Promise<HistoryNode | null> {
    const userId = await this.resolveUserId(user);
    const row = await prisma.historyNode.findUnique({
      where: { userId_opId: { userId, opId: id } },
    });
    if (!row) return null;
    return { id: row.opId, op: row.op as unknown as Operation };
  }

  async all(user: string): Promise<HistoryNode[]> {
    const userId = await this.resolveUserId(user);
    return this.allByUserId(userId);
  }

  private async allByUserId(userId: number): Promise<HistoryNode[]> {
    const rows = await prisma.historyNode.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.opId, op: row.op as unknown as Operation }));
  }

  /** Replace the user's whole history; rejected when `base` is not the current head. */
  async replace(user: string, base: string | null, nodes: HistoryNode[]): Promise<void> {
    const userId = await this.resolveUserId(user);
    return this.exclusive(async () => {
      await prisma.$transaction(async (tx) => {
        const userRow = await tx.user.findUnique({ where: { id: userId } });
        const headId = userRow?.headOpId ?? null;
        if (headId !== base) throw new BaseMismatchError(headId, base);
        await tx.historyNode.deleteMany({ where: { userId } });
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!;
          await tx.historyNode.create({
            data: {
              userId,
              opId: n.id,
              parentOpId: nodes[i - 1]?.id ?? null,
              op: asJson(n.op),
            },
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: { headOpId: nodes.at(-1)?.id ?? null },
        });
      });
      this.states.set(userId, WorktreeState.fromOps(nodes.map((n) => n.op)));
    });
  }
}
