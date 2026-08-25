import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FileStorage,
  currentUserPath,
  defaultStatePath,
  deleteToken,
  readCurrentUser,
  readToken,
  tokenPath,
  writeCurrentUser,
  writeToken,
} from '../src/storage';
import type { SavedState } from '@worktree/client';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-storage-'));

const sampleState = (): SavedState => ({
  confirmed: [{ id: 'h1', op: { kind: 'add', parentId: 'root', id: 'a', name: 'A', weight: 1 } }],
  pending: [{ kind: 'add', id: 'h2', op: { kind: 'rename', id: 'a', name: 'A2' } }],
});

describe('FileStorage', () => {
  it('round-trips state, creating directories as needed', () => {
    const file = path.join(tmpDir(), 'nested', 'state.json');
    const storage = new FileStorage(file);
    const state = sampleState();
    storage.save(state);
    expect(fs.existsSync(file)).toBe(true);
    expect(storage.load()).toEqual(state);
  });

  it('overwrites previous saves', () => {
    const file = path.join(tmpDir(), 'state.json');
    const storage = new FileStorage(file);
    storage.save(sampleState());
    const next = sampleState();
    next.pending = [];
    storage.save(next);
    expect(storage.load()).toEqual(next);
  });

  it('returns null when there is no file', () => {
    expect(new FileStorage(path.join(tmpDir(), 'missing.json')).load()).toBeNull();
  });

  it('preserves a corrupt file and returns null', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'state.json');
    fs.writeFileSync(file, '{not json');
    expect(new FileStorage(file).load()).toBeNull();
    const leftovers = fs.readdirSync(dir).filter((f) => f !== 'state.json');
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]).toMatch(/^state\.json\.corrupt-/);
    expect(fs.readFileSync(path.join(dir, leftovers[0]!), 'utf8')).toBe('{not json');
  });

  it('rejects files with an invalid shape and preserves them', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'state.json');
    fs.writeFileSync(file, JSON.stringify({ confirmed: 'nope' }));
    expect(new FileStorage(file).load()).toBeNull();
    expect(fs.readdirSync(dir).filter((f) => f !== 'state.json')).toHaveLength(1);
  });
});

describe('defaultStatePath', () => {
  it('namespaces by server host and user', () => {
    const home = process.env.HOME!;
    expect(defaultStatePath('http://localhost:3000', 'alice')).toBe(
      path.join(home, '.worktree', 'localhost_3000', 'alice', 'state.json'),
    );
    expect(defaultStatePath('https://worktree.example.com', 'bob')).toBe(
      path.join(home, '.worktree', 'worktree.example.com', 'bob', 'state.json'),
    );
  });

  it('sanitizes unsafe characters in user ids', () => {
    const home = process.env.HOME!;
    expect(defaultStatePath('http://localhost:3000', 'a/b')).toBe(
      path.join(home, '.worktree', 'localhost_3000', 'a_b', 'state.json'),
    );
  });

  it('keeps the local user device-local, independent of the server', () => {
    const home = process.env.HOME!;
    expect(defaultStatePath('http://localhost:3000', 'local')).toBe(
      path.join(home, '.worktree', 'local', 'state.json'),
    );
    expect(defaultStatePath('https://other.example.com', 'local')).toBe(
      path.join(home, '.worktree', 'local', 'state.json'),
    );
  });
});

describe('currentUser', () => {
  it('round-trips the persisted current user', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-home-'));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(readCurrentUser('http://localhost:3000')).toBeNull();
      writeCurrentUser('http://localhost:3000', 'alice');
      expect(readCurrentUser('http://localhost:3000')).toBe('alice');
      expect(currentUserPath('http://localhost:3000')).toBe(
        path.join(home, '.worktree', 'localhost_3000', 'current-user'),
      );
    } finally {
      process.env.HOME = prevHome;
    }
  });

  it('ignores an invalid persisted current user', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-home-'));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const dir = path.join(home, '.worktree', 'localhost_3000');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'current-user'), 'a/b\n');
      expect(readCurrentUser('http://localhost:3000')).toBeNull();
    } finally {
      process.env.HOME = prevHome;
    }
  });
});

describe('token storage', () => {
  const withHome = <T>(fn: (home: string) => T): T => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-home-'));
    const prevHome = process.env.HOME;
    process.env.HOME = home;
    try {
      return fn(home);
    } finally {
      process.env.HOME = prevHome;
    }
  };

  it('round-trips tokens and keeps them per server/user', () => {
    withHome(() => {
      const stored = { token: 'tok-1', tokenId: 7, label: 'mac (cli)' };
      writeToken('http://localhost:3000', 'alice', stored);
      expect(readToken('http://localhost:3000', 'alice')).toEqual(stored);
      expect(readToken('http://localhost:3000', 'bob')).toBeNull();
      expect(readToken('https://other.example.com', 'alice')).toBeNull();
      deleteToken('http://localhost:3000', 'alice');
      expect(readToken('http://localhost:3000', 'alice')).toBeNull();
    });
  });

  it('writes token files with mode 0600', () => {
    withHome(() => {
      writeToken('http://localhost:3000', 'alice', { token: 'tok-1', tokenId: 1 });
      const file = tokenPath('http://localhost:3000', 'alice');
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    });
  });

  it('namespaces the token path like the state path', () => {
    const home = process.env.HOME!;
    expect(tokenPath('http://localhost:3000', 'alice')).toBe(
      path.join(home, '.worktree', 'localhost_3000', 'alice', 'token.json'),
    );
  });

  it('ignores corrupt or invalid token files', () => {
    withHome((home) => {
      const dir = path.join(home, '.worktree', 'localhost_3000', 'alice');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'token.json'), '{not json');
      expect(readToken('http://localhost:3000', 'alice')).toBeNull();
      fs.writeFileSync(path.join(dir, 'token.json'), JSON.stringify({ token: 'tok' }));
      expect(readToken('http://localhost:3000', 'alice')).toBeNull();
    });
  });
});
