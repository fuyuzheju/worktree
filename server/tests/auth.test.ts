import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetDb } from './helpers/prismaMock';

vi.mock('../src/db', () => ({ prisma: prismaMock }));

import {
  UsernameTakenError,
  generateToken,
  hashPassword,
  hashToken,
  listTokens,
  loginUser,
  registerUser,
  resolveToken,
  revokeToken,
  verifyPassword,
} from '../src/auth';
import { OpenRegistrationGate, createRegistrationGate } from '../src/registration';

const PW = 'hunter2222';

const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected a value');
  return v;
};

describe('password hashing', () => {
  it('produces the self-describing scrypt format and verifies roundtrip', async () => {
    const stored = await hashPassword(PW);
    expect(stored).toMatch(/^scrypt\$N=16384,r=8,p=1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword(PW, stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const stored = await hashPassword(PW);
    expect(await verifyPassword('wrong-password', stored)).toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword(PW, 'not-a-hash')).toBe(false);
    expect(await verifyPassword(PW, 'scrypt$N=abc,r=8,p=1$c2FsdA==$a2V5')).toBe(false);
    // absurd params must be rejected instead of computed
    expect(await verifyPassword(PW, 'scrypt$N=99999999,r=99,p=99$c2FsdA==$a2V5')).toBe(false);
  });

  it('hashes are salted (same password, different stored strings)', async () => {
    expect(await hashPassword(PW)).not.toBe(await hashPassword(PW));
  });
});

describe('tokens', () => {
  it('generates 43-char base64url tokens and stable 64-char hex hashes', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const hashed = hashToken(token);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashed);
  });

  it('generates unique tokens', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('registerUser', () => {
  beforeEach(() => resetDb());

  it('creates the user and issues a token', async () => {
    const auth = await registerUser('alice', PW);
    expect(auth.username).toBe('alice');
    expect(await resolveToken(auth.token)).toMatchObject({ username: 'alice', tokenId: auth.tokenId });
  });

  it('rejects a taken username without touching the existing user', async () => {
    await registerUser('alice', PW);
    await expect(registerUser('alice', 'another-password')).rejects.toBeInstanceOf(UsernameTakenError);
    // the original password still works
    expect(await loginUser('alice', PW, null)).not.toBeNull();
    expect(await loginUser('alice', 'another-password', null)).toBeNull();
  });
});

describe('loginUser', () => {
  beforeEach(async () => {
    resetDb();
    await registerUser('alice', PW);
  });

  it('returns a token on correct credentials', async () => {
    const auth = must(await loginUser('alice', PW, 'my-phone'));
    expect(auth.username).toBe('alice');
    expect(await resolveToken(auth.token)).toMatchObject({ tokenId: auth.tokenId });
  });

  it('returns null on wrong password', async () => {
    expect(await loginUser('alice', 'wrong', null)).toBeNull();
  });

  it('returns null on unknown username (same result as wrong password)', async () => {
    expect(await loginUser('nobody', PW, null)).toBeNull();
  });
});

describe('token management', () => {
  beforeEach(() => resetDb());

  it('resolveToken maps a token to its user; unknown or revoked tokens resolve to null', async () => {
    await registerUser('bob', PW);
    const auth = must(await loginUser('bob', PW, null));
    const resolved = must(await resolveToken(auth.token));
    expect(resolved).toMatchObject({ username: 'bob', tokenId: auth.tokenId, lastUsedAt: null });

    expect(await resolveToken('bogus-token')).toBeNull();
    await revokeToken(resolved.userId, resolved.tokenId);
    expect(await resolveToken(auth.token)).toBeNull();
  });

  it('lists tokens per user and revokes only the caller\'s own', async () => {
    await registerUser('alice', PW);
    await registerUser('bob', PW);
    const aliceAuth = must(await loginUser('alice', PW, 'device-1'));
    const bobAuth = must(await loginUser('bob', PW, null));

    const aliceTokens = await listTokens(must(await resolveToken(aliceAuth.token)).userId);
    expect(aliceTokens).toHaveLength(2); // register + login
    expect(new Set(aliceTokens.map((t) => t.label))).toEqual(new Set([null, 'device-1']));

    const aliceUserId = must(await resolveToken(aliceAuth.token)).userId;
    const bobTokenId = must(await resolveToken(bobAuth.token)).tokenId;
    // revoking another user's token id is a no-op
    expect(await revokeToken(aliceUserId, bobTokenId)).toBe(false);
    expect(await resolveToken(bobAuth.token)).not.toBeNull();
    expect(await revokeToken(aliceUserId, aliceAuth.tokenId)).toBe(true);
  });
});

describe('registration gate', () => {
  it('open registration allows everyone', () => {
    const gate = new OpenRegistrationGate();
    expect(gate.check('alice', undefined)).toEqual({ ok: true });
    expect(gate.check('alice', 'whatever')).toEqual({ ok: true });
  });

  it('unknown modes fail fast', () => {
    expect(() => createRegistrationGate('invite')).toThrow(/REGISTRATION_MODE/);
  });
});
