import { Tree } from '@worktree/core';
import type { HistoryNode, HistoryOperation, TreeOperation } from '@worktree/core';
import type { Prisma } from '@prisma/client';
import { prisma } from './db';

const HEAD_KEY = 'head';

const asJson = (op: TreeOperation): Prisma.InputJsonValue => op as unknown as Prisma.InputJsonValue;

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

/** What an appendBatch actually appended (duplicates are skipped). */
export interface AppendResult {
  added: HistoryNode[];
  removed: string[];
}

/** Server-side history: Prisma persistence + the tree derived from it. */
export class HistoryStore {
  private tree = new Tree();
  private queue: Promise<unknown> = Promise.resolve();

  getTree(): Tree {
    return this.tree;
  }

  /** Load persisted history into memory. Call once at boot. */
  async load(): Promise<void> {
    const rows = await prisma.historyNode.findMany({ orderBy: { id: 'asc' } });
    this.tree = new Tree();
    for (const row of rows) this.tree.apply(row.op as unknown as TreeOperation);
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

  /**
   * Append a batch atomically. Duplicate ids with the same op are skipped
   * (idempotent retry); a duplicate id with a different op is rejected.
   * `remove` undoes the current head.
   */
  async appendBatch(ops: HistoryOperation[]): Promise<AppendResult> {
    return this.exclusive(async () => {
      const added: HistoryNode[] = [];
      const removed: string[] = [];
      await prisma.$transaction(async (tx) => {
        for (const op of ops) {
          if (op.kind === 'remove') {
            const head = await tx.meta.findUnique({ where: { key: HEAD_KEY } });
            const headId = head?.value ?? null;
            if (headId !== op.id) throw new HeadUndoError(op.id, headId);
            const row = await tx.historyNode.findUnique({ where: { opId: op.id } });
            if (!row) throw new HeadUndoError(op.id, headId);
            await tx.historyNode.delete({ where: { opId: op.id } });
            if (row.parentOpId === null) {
              await tx.meta.deleteMany({ where: { key: HEAD_KEY } });
            } else {
              await tx.meta.upsert({
                where: { key: HEAD_KEY },
                update: { value: row.parentOpId },
                create: { key: HEAD_KEY, value: row.parentOpId },
              });
            }
            removed.push(op.id);
            continue;
          }
          const existing = await tx.historyNode.findUnique({ where: { opId: op.id } });
          if (existing) {
            if (JSON.stringify(existing.op) !== JSON.stringify(op.op)) throw new DuplicateOpError(op.id);
            continue;
          }
          const head = await tx.meta.findUnique({ where: { key: HEAD_KEY } });
          const headId = head?.value ?? null;
          await tx.historyNode.create({
            data: { opId: op.id, parentOpId: headId, op: asJson(op.op) },
          });
          await tx.meta.upsert({
            where: { key: HEAD_KEY },
            update: { value: op.id },
            create: { key: HEAD_KEY, value: op.id },
          });
          added.push({ id: op.id, op: op.op });
        }
      });
      if (removed.length > 0) {
        await this.load();
      } else {
        for (const n of added) this.tree.apply(n.op);
      }
      return { added, removed };
    });
  }

  /** Main chain after (exclusive) cursorId; unknown cursor yields the whole chain with cursorFound=false. */
  async since(cursorId: string | null): Promise<{ cursorFound: boolean; nodes: HistoryNode[] }> {
    if (cursorId === null) {
      return { cursorFound: true, nodes: await this.all() };
    }
    const cursor = await prisma.historyNode.findUnique({ where: { opId: cursorId } });
    if (!cursor) {
      return { cursorFound: false, nodes: await this.all() };
    }
    const rows = await prisma.historyNode.findMany({ where: { id: { gt: cursor.id } }, orderBy: { id: 'asc' } });
    return {
      cursorFound: true,
      nodes: rows.map((row) => ({ id: row.opId, op: row.op as unknown as TreeOperation })),
    };
  }

  async getById(id: string): Promise<HistoryNode | null> {
    const row = await prisma.historyNode.findUnique({ where: { opId: id } });
    if (!row) return null;
    return { id: row.opId, op: row.op as unknown as TreeOperation };
  }

  async all(): Promise<HistoryNode[]> {
    const rows = await prisma.historyNode.findMany({ orderBy: { id: 'asc' } });
    return rows.map((row) => ({ id: row.opId, op: row.op as unknown as TreeOperation }));
  }

  /** Replace the whole history; rejected when `base` is not the current head. */
  async replace(base: string | null, nodes: HistoryNode[]): Promise<void> {
    return this.exclusive(async () => {
      await prisma.$transaction(async (tx) => {
        const head = await tx.meta.findUnique({ where: { key: HEAD_KEY } });
        const headId = head?.value ?? null;
        if (headId !== base) throw new BaseMismatchError(headId, base);
        await tx.historyNode.deleteMany();
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!;
          await tx.historyNode.create({
            data: { id: i + 1, opId: n.id, parentOpId: nodes[i - 1]?.id ?? null, op: asJson(n.op) },
          });
        }
        const newHead = nodes.at(-1)?.id ?? null;
        if (newHead === null) {
          await tx.meta.deleteMany({ where: { key: HEAD_KEY } });
        } else {
          await tx.meta.upsert({
            where: { key: HEAD_KEY },
            update: { value: newHead },
            create: { key: HEAD_KEY, value: newHead },
          });
        }
      });
      this.tree = Tree.fromOps(nodes.map((n) => n.op));
    });
  }
}
