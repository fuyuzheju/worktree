import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileStorage, defaultStatePath } from '../src/storage';
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
});
