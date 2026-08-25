import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './db';

export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 1024;
export const LABEL_MAX_LEN = 100;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function scryptAsync(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// Self-describing format so params can be raised later without a migration:
// scrypt$N=16384,r=8,p=1$<salt-b64>$<key-b64>
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(stored);
  if (!m) return false;
  const n = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  // Cap params: they come from our own writes, but a tampered hash must not
  // turn verification into a DoS vector.
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 2 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  const salt = Buffer.from(m[4], 'base64');
  const expected = Buffer.from(m[5], 'base64');
  const key = await scryptAsync(password, salt, expected.length, { N: n, r, p });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

/** Opaque 256-bit device token; the server only ever stores its hash. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** High-entropy tokens need no slow KDF — plain SHA-256 is correct here. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class UsernameTakenError extends Error {
  constructor() {
    super('username taken');
  }
}

async function createToken(userId: number, label: string | null): Promise<{ token: string; tokenId: number }> {
  const token = generateToken();
  const row = await prisma.token.create({ data: { tokenHash: hashToken(token), userId, label } });
  return { token, tokenId: row.id };
}

export async function registerUser(
  username: string,
  password: string,
): Promise<{ username: string; token: string; tokenId: number }> {
  const passwordHash = await hashPassword(password);
  try {
    // create + P2002, never upsert: upsert would overwrite an existing
    // user's passwordHash and hand over the account.
    const user = await prisma.user.create({ data: { name: username, passwordHash } });
    const { token, tokenId } = await createToken(user.id, null);
    return { username: user.name, token, tokenId };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new UsernameTakenError();
    }
    throw e;
  }
}

export async function loginUser(
  username: string,
  password: string,
  label: string | null,
): Promise<{ username: string; token: string; tokenId: number } | null> {
  const user = await prisma.user.findUnique({ where: { name: username } });
  if (!user) {
    // Burn scrypt time on unknown users too, so login timing does not
    // reveal which usernames exist.
    await verifyPassword(password, await DUMMY_HASH);
    return null;
  }
  if (user.passwordHash === null || !(await verifyPassword(password, user.passwordHash))) return null;
  const { token, tokenId } = await createToken(user.id, label);
  return { username: user.name, token, tokenId };
}

export interface ResolvedToken {
  userId: number;
  username: string;
  tokenId: number;
  lastUsedAt: Date | null;
}

export async function resolveToken(token: string): Promise<ResolvedToken | null> {
  const row = await prisma.token.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!row) return null;
  return { userId: row.userId, username: row.user.name, tokenId: row.id, lastUsedAt: row.lastUsedAt };
}

export async function listTokens(
  userId: number,
): Promise<Array<{ id: number; label: string | null; createdAt: Date; lastUsedAt: Date | null }>> {
  return prisma.token.findMany({ where: { userId }, orderBy: { id: 'asc' } });
}

export async function revokeToken(userId: number, tokenId: number): Promise<boolean> {
  const res = await prisma.token.deleteMany({ where: { id: tokenId, userId } });
  return res.count > 0;
}

const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** Throttled lastUsedAt touch — at most one UPDATE per token per hour. */
export async function touchToken(tokenId: number, lastUsedAt: Date | null): Promise<void> {
  if (lastUsedAt !== null && Date.now() - lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
  try {
    await prisma.token.update({ where: { id: tokenId }, data: { lastUsedAt: new Date() } });
  } catch {
    // Token revoked concurrently — the request itself already succeeded.
  }
}
