import { Prisma } from '@prisma/client';
import { vi } from 'vitest';

export interface UserRow {
  id: number;
  name: string;
  passwordHash: string | null;
  headOpId: string | null;
}

export interface HistoryRow {
  id: number;
  userId: number;
  opId: string;
  parentOpId: string | null;
  op: unknown;
}

export interface TokenRow {
  id: number;
  tokenHash: string;
  label: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  userId: number;
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  userId: number;
}

export interface ReminderFireRow {
  id: number;
  rmdId: string;
  occurrence: bigint;
  createdAt: Date;
  userId: number;
}

interface Tx {
  user: {
    findUnique: (args: { where: { id: number } | { name: string } }) => Promise<UserRow | null>;
    findMany: () => Promise<UserRow[]>;
    create: (args: { data: { name: string; passwordHash: string | null } }) => Promise<UserRow>;
    update: (args: { where: { id: number }; data: { headOpId: string | null } }) => Promise<UserRow>;
  };
  historyNode: {
    findMany: (args: { where?: { userId?: number; id?: { gt: number } }; orderBy: { id: 'asc' } }) => Promise<HistoryRow[]>;
    findUnique: (args: { where: { userId_opId: { userId: number; opId: string } } }) => Promise<HistoryRow | null>;
    create: (args: { data: { userId: number; opId: string; parentOpId: string | null; op: unknown } }) => Promise<HistoryRow>;
    delete: (args: { where: { userId_opId: { userId: number; opId: string } } }) => Promise<HistoryRow>;
    deleteMany: (args: { where: { userId: number } }) => Promise<{ count: number }>;
  };
  token: {
    create: (args: { data: { tokenHash: string; userId: number; label: string | null } }) => Promise<TokenRow>;
    findUnique: (args: { where: { tokenHash: string }; include: { user: true } }) => Promise<(TokenRow & { user: UserRow }) | null>;
    findMany: (args: { where: { userId: number }; orderBy: { id: 'asc' } }) => Promise<TokenRow[]>;
    deleteMany: (args: { where: { id: number; userId: number } }) => Promise<{ count: number }>;
    update: (args: { where: { id: number }; data: { lastUsedAt: Date } }) => Promise<TokenRow>;
  };
  pushSubscription: {
    create: (args: { data: { endpoint: string; p256dh: string; auth: string; userId: number } }) => Promise<PushSubscriptionRow>;
    findMany: (args: { where: { userId?: number } }) => Promise<PushSubscriptionRow[]>;
    upsert: (args: {
      where: { endpoint: string };
      create: { endpoint: string; p256dh: string; auth: string; userId: number };
      update: { p256dh: string; auth: string; userId: number; lastUsedAt: Date };
    }) => Promise<PushSubscriptionRow>;
    delete: (args: { where: { id: number } }) => Promise<PushSubscriptionRow>;
    deleteMany: (args: { where: { endpoint?: string; userId?: number } }) => Promise<{ count: number }>;
  };
  reminderFire: {
    create: (args: { data: { userId: number; rmdId: string; occurrence: number | bigint } }) => Promise<ReminderFireRow>;
    deleteMany: (args: { where: { userId: number; rmdId: string; occurrence: number | bigint } }) => Promise<{ count: number }>;
  };
}

const hoisted = vi.hoisted(() => {
  const historyRows = new Map<number, HistoryRow>();
  const users = new Map<number, UserRow>();
  const usersByName = new Map<string, number>();
  const tokens = new Map<number, TokenRow>();
  const tokensByHash = new Map<string, number>();
  const pushSubs = new Map<number, PushSubscriptionRow>();
  const pushSubsByEndpoint = new Map<string, number>();
  const reminderFires = new Map<number, ReminderFireRow>();
  let nextId = 1;
  let nextUserId = 1;
  let nextTokenId = 1;
  let nextPushSubId = 1;
  let nextReminderFireId = 1;

  const resetDb = () => {
    historyRows.clear();
    users.clear();
    usersByName.clear();
    tokens.clear();
    tokensByHash.clear();
    pushSubs.clear();
    pushSubsByEndpoint.clear();
    reminderFires.clear();
    nextId = 1;
    nextUserId = 1;
    nextTokenId = 1;
    nextPushSubId = 1;
    nextReminderFireId = 1;
  };

  const mustGetUser = (id: number): UserRow => {
    const user = users.get(id);
    if (!user) throw new Error(`user ${id} not found`);
    return user;
  };

  const mustGetToken = (id: number): TokenRow => {
    const token = tokens.get(id);
    if (!token) throw new Error(`token ${id} not found`);
    return token;
  };

  const tx: Tx = {
    user: {
      async findUnique({ where }) {
        if ('id' in where) return users.get(where.id) ?? null;
        const id = usersByName.get(where.name);
        return id === undefined ? null : (users.get(id) ?? null);
      },
      async findMany() {
        return [...users.values()];
      },
      async create({ data }) {
        if (usersByName.has(data.name)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`name`)', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row: UserRow = { id: nextUserId++, name: data.name, passwordHash: data.passwordHash, headOpId: null };
        users.set(row.id, row);
        usersByName.set(row.name, row.id);
        return row;
      },
      async update({ where, data }) {
        const row = mustGetUser(where.id);
        row.headOpId = data.headOpId;
        return row;
      },
    },
    historyNode: {
      async findMany(args) {
        const uid = args.where?.userId;
        const gt = args.where?.id?.gt;
        return [...historyRows.values()]
          .filter((r) => (uid === undefined || r.userId === uid) && (gt === undefined || r.id > gt))
          .sort((a, b) => a.id - b.id);
      },
      async findUnique({ where }) {
        for (const row of historyRows.values()) {
          if (row.userId === where.userId_opId.userId && row.opId === where.userId_opId.opId) return row;
        }
        return null;
      },
      async create({ data }) {
        const row: HistoryRow = {
          id: nextId++,
          userId: data.userId,
          opId: data.opId,
          parentOpId: data.parentOpId,
          op: data.op,
        };
        historyRows.set(row.id, row);
        return row;
      },
      async delete({ where }) {
        for (const [id, row] of historyRows) {
          if (row.userId === where.userId_opId.userId && row.opId === where.userId_opId.opId) {
            historyRows.delete(id);
            return row;
          }
        }
        throw new Error('row not found');
      },
      async deleteMany({ where }) {
        let n = 0;
        for (const [id, row] of [...historyRows]) {
          if (row.userId === where.userId) {
            historyRows.delete(id);
            n++;
          }
        }
        return { count: n };
      },
    },
    token: {
      async create({ data }) {
        const row: TokenRow = {
          id: nextTokenId++,
          tokenHash: data.tokenHash,
          label: data.label,
          createdAt: new Date(),
          lastUsedAt: null,
          userId: data.userId,
        };
        tokens.set(row.id, row);
        tokensByHash.set(row.tokenHash, row.id);
        return row;
      },
      async findUnique({ where, include }) {
        const id = tokensByHash.get(where.tokenHash);
        if (id === undefined) return null;
        const row = mustGetToken(id);
        return include?.user === true ? { ...row, user: mustGetUser(row.userId) } : (row as never);
      },
      async findMany({ where }) {
        return [...tokens.values()].filter((t) => t.userId === where.userId).sort((a, b) => a.id - b.id);
      },
      async deleteMany({ where }) {
        const row = tokens.get(where.id);
        if (!row || row.userId !== where.userId) return { count: 0 };
        tokens.delete(row.id);
        tokensByHash.delete(row.tokenHash);
        return { count: 1 };
      },
      async update({ where, data }) {
        const row = mustGetToken(where.id);
        row.lastUsedAt = data.lastUsedAt;
        return row;
      },
    },
    pushSubscription: {
      async create({ data }) {
        if (pushSubsByEndpoint.has(data.endpoint)) {
          throw new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`endpoint`)',
            { code: 'P2002', clientVersion: 'test' },
          );
        }
        const row: PushSubscriptionRow = {
          id: nextPushSubId++,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          createdAt: new Date(),
          lastUsedAt: null,
          userId: data.userId,
        };
        pushSubs.set(row.id, row);
        pushSubsByEndpoint.set(row.endpoint, row.id);
        return row;
      },
      async findMany({ where }) {
        return [...pushSubs.values()].filter((s) => where.userId === undefined || s.userId === where.userId);
      },
      async upsert({ where, create, update }) {
        const existingId = pushSubsByEndpoint.get(where.endpoint);
        if (existingId === undefined) return this.create({ data: create });
        const row = pushSubs.get(existingId)!;
        row.p256dh = update.p256dh;
        row.auth = update.auth;
        row.userId = update.userId;
        row.lastUsedAt = update.lastUsedAt;
        return row;
      },
      async delete({ where }) {
        const row = pushSubs.get(where.id);
        if (!row) throw new Error('row not found');
        pushSubs.delete(row.id);
        pushSubsByEndpoint.delete(row.endpoint);
        return row;
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const [id, row] of [...pushSubs]) {
          if ((where.endpoint === undefined || row.endpoint === where.endpoint) &&
              (where.userId === undefined || row.userId === where.userId)) {
            pushSubs.delete(id);
            pushSubsByEndpoint.delete(row.endpoint);
            count++;
          }
        }
        return { count };
      },
    },
    reminderFire: {
      async create({ data }) {
        const occurrence = BigInt(data.occurrence);
        for (const row of reminderFires.values()) {
          if (row.userId === data.userId && row.rmdId === data.rmdId && row.occurrence === occurrence) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`userId`,`rmdId`,`occurrence`)',
              { code: 'P2002', clientVersion: 'test' },
            );
          }
        }
        const row: ReminderFireRow = {
          id: nextReminderFireId++,
          rmdId: data.rmdId,
          occurrence,
          createdAt: new Date(),
          userId: data.userId,
        };
        reminderFires.set(row.id, row);
        return row;
      },
      async deleteMany({ where }) {
        const occurrence = BigInt(where.occurrence);
        let count = 0;
        for (const [id, row] of [...reminderFires]) {
          if (row.userId === where.userId && row.rmdId === where.rmdId && row.occurrence === occurrence) {
            reminderFires.delete(id);
            count++;
          }
        }
        return { count };
      },
    },
  };

  const prismaMock = {
    user: tx.user,
    historyNode: tx.historyNode,
    token: tx.token,
    pushSubscription: tx.pushSubscription,
    reminderFire: tx.reminderFire,
    async $transaction<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
      const snapshot = {
        historyRows: new Map(historyRows),
        users: new Map(users),
        usersByName: new Map(usersByName),
        tokens: new Map(tokens),
        tokensByHash: new Map(tokensByHash),
        pushSubs: new Map(pushSubs),
        pushSubsByEndpoint: new Map(pushSubsByEndpoint),
        reminderFires: new Map(reminderFires),
        nextId,
        nextUserId,
        nextTokenId,
        nextPushSubId,
        nextReminderFireId,
      };
      try {
        return await fn(tx);
      } catch (e) {
        historyRows.clear();
        for (const [k, v] of snapshot.historyRows) historyRows.set(k, v);
        users.clear();
        for (const [k, v] of snapshot.users) users.set(k, v);
        usersByName.clear();
        for (const [k, v] of snapshot.usersByName) usersByName.set(k, v);
        tokens.clear();
        for (const [k, v] of snapshot.tokens) tokens.set(k, v);
        tokensByHash.clear();
        for (const [k, v] of snapshot.tokensByHash) tokensByHash.set(k, v);
        pushSubs.clear();
        for (const [k, v] of snapshot.pushSubs) pushSubs.set(k, v);
        pushSubsByEndpoint.clear();
        for (const [k, v] of snapshot.pushSubsByEndpoint) pushSubsByEndpoint.set(k, v);
        reminderFires.clear();
        for (const [k, v] of snapshot.reminderFires) reminderFires.set(k, v);
        nextId = snapshot.nextId;
        nextUserId = snapshot.nextUserId;
        nextTokenId = snapshot.nextTokenId;
        nextPushSubId = snapshot.nextPushSubId;
        nextReminderFireId = snapshot.nextReminderFireId;
        throw e;
      }
    },
  };

  const seedUser = async (name: string): Promise<number> => {
    const existing = usersByName.get(name);
    if (existing !== undefined) return existing;
    const row: UserRow = { id: nextUserId++, name, passwordHash: null, headOpId: null };
    users.set(row.id, row);
    usersByName.set(row.name, row.id);
    return row.id;
  };

  return { prismaMock, resetDb, seedUser };
});

export const prismaMock = hoisted.prismaMock;
export const resetDb = hoisted.resetDb;
export const seedUser = hoisted.seedUser;
