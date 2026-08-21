import { describe, expect, it } from 'vitest';
import { ROOT_ID, Tree } from '@worktree/core';
import { COMMANDS, completeLine } from '../src/completion';

const build = () =>
  Tree.fromOps([
    { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'alpha', weight: 1 },
    { kind: 'add', parentId: ROOT_ID, id: 'bbbb-1', name: 'beta', weight: 2 },
    { kind: 'add', parentId: ROOT_ID, id: 'eeee-1', name: 'alpine', weight: 3 },
    { kind: 'add', parentId: 'aaaa-1', id: 'cccc-1', name: 'gamma', weight: 1 },
    { kind: 'add', parentId: 'cccc-1', id: 'dddd-1', name: 'delta', weight: 1 },
  ]);

const alphaId = 'aaaa-1';

describe('completeLine — commands', () => {
  it('lists all commands on an empty line', () => {
    const [hits, replacement] = completeLine(build().getRoot(), ROOT_ID, '');
    expect(hits).toEqual(COMMANDS);
    expect(replacement).toBe('');
  });

  it('completes a command prefix with the matched token as the replacement', () => {
    const [hits, replacement] = completeLine(build().getRoot(), ROOT_ID, 'st');
    expect(hits).toEqual(['stats', 'status']);
    expect(replacement).toBe('st');
  });

  it('completes an unambiguous command with a trailing space', () => {
    const [hits, replacement] = completeLine(build().getRoot(), ROOT_ID, 'syn');
    expect(hits).toEqual(['sync ']);
    expect(replacement).toBe('syn');
  });
});

describe('completeLine — refs', () => {
  it('lists cwd children on an empty ref token', () => {
    const root = build().getRoot();
    const [hits, replacement] = completeLine(root, ROOT_ID, 'cd ');
    expect(hits).toEqual(['alpha', 'beta', 'alpine']);
    expect(replacement).toBe('');
  });

  it('completes a bare prefix against cwd children', () => {
    const root = build().getRoot();
    const [hits, replacement] = completeLine(root, ROOT_ID, 'cd b');
    expect(hits).toEqual(['beta ']);
    expect(replacement).toBe('b');
  });

  it('appends "/" for a node with children and a space for a leaf', () => {
    const root = build().getRoot();
    expect(completeLine(root, ROOT_ID, 'cd alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'cd be')[0]).toEqual(['beta ']);
  });

  it('multiple matches return full hits and the matched token (readline fills the common prefix)', () => {
    const root = build().getRoot();
    const [hits, replacement] = completeLine(root, ROOT_ID, 'cd al');
    expect(hits).toEqual(['alpha', 'alpine']);
    expect(replacement).toBe('al');
  });

  it('completes path segments after a slash', () => {
    const root = build().getRoot();
    const [hits, replacement] = completeLine(root, ROOT_ID, 'cd alpha/g');
    expect(hits).toEqual(['alpha/gamma/']);
    expect(replacement).toBe('alpha/g');
  });

  it('completes absolute paths from the root', () => {
    const root = build().getRoot();
    expect(completeLine(root, alphaId, 'cd /alph')[0]).toEqual(['/alpha/']);
    expect(completeLine(root, alphaId, 'cd /alpha/g')[0]).toEqual(['/alpha/gamma/']);
  });

  it('resolves relative paths from the cwd', () => {
    const root = build().getRoot();
    // cwd = alpha: its only child is gamma
    expect(completeLine(root, alphaId, 'cd ')[0]).toEqual(['gamma/']);
    expect(completeLine(root, alphaId, 'cd g')[0]).toEqual(['gamma/']);
  });

  it('supports .. and . tokens', () => {
    const root = build().getRoot();
    expect(completeLine(root, alphaId, 'cd ..')[0]).toEqual(['../']);
    expect(completeLine(root, alphaId, 'cd .')[0]).toEqual(['./']);
    // from alpha, ../b completes root's beta
    expect(completeLine(root, alphaId, 'cd ../b')[0]).toEqual(['../beta ']);
  });

  it('returns no completions for unknown directories', () => {
    const root = build().getRoot();
    expect(completeLine(root, ROOT_ID, 'cd nope/x')).toEqual([[], 'nope/x']);
  });

  it('completes refs in the right argument positions', () => {
    const root = build().getRoot();
    expect(completeLine(root, ROOT_ID, 'mv alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'mv beta alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'cp beta be')[0]).toEqual(['beta ']);
    expect(completeLine(root, ROOT_ID, 'rename be')[0]).toEqual(['beta ']);
    expect(completeLine(root, ROOT_ID, 'cpl alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'ls alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'tree alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'add foo alph')[0]).toEqual(['alpha/']);
    // add's second position is the node NAME — no completion there
    expect(completeLine(root, ROOT_ID, 'add al')).toEqual([[], 'al']);
  });
});

describe('completeLine — subcommands and flags', () => {
  it('completes reminder subcommands and the node ref after "reminder add"', () => {
    const root = build().getRoot();
    expect(completeLine(root, ROOT_ID, 'reminder ')[0]).toEqual(['add', 'rm', 'edit']);
    expect(completeLine(root, ROOT_ID, 'reminder a')[0]).toEqual(['add ']);
    expect(completeLine(root, ROOT_ID, 'reminder add alph')[0]).toEqual(['alpha/']);
    expect(completeLine(root, ROOT_ID, 'reminder rm x')).toEqual([[], 'x']);
  });

  it('completes resolve choices', () => {
    const root = build().getRoot();
    expect(completeLine(root, ROOT_ID, 'resolve s')[0]).toEqual(['server ']);
    expect(completeLine(root, ROOT_ID, 'resolve ')[0]).toEqual(['server', 'local']);
  });

  it('completes rm flags and refs, including after a flag', () => {
    const root = build().getRoot();
    expect(completeLine(root, ROOT_ID, 'rm -')[0]).toEqual(['-r', '--recursive']);
    expect(completeLine(root, ROOT_ID, 'rm be')[0]).toEqual(['beta ']);
    expect(completeLine(root, ROOT_ID, 'rm -r be')[0]).toEqual(['beta ']);
  });

  it('completes reminder ids for reminder rm/edit', () => {
    const tree = build();
    tree.getNode('aaaa-1')!.reminders.push({ id: 'rmd-1234', name: 'R', deadline: 1, active: true });
    tree.getNode('bbbb-1')!.reminders.push({ id: 'rmd-5678', name: 'R2', deadline: 2, active: false });
    const root = tree.getRoot();
    expect(completeLine(root, ROOT_ID, 'reminder rm ')[0]).toEqual(['rmd-1234', 'rmd-5678']);
    expect(completeLine(root, ROOT_ID, 'reminder rm rmd-5')[0]).toEqual(['rmd-5678 ']);
    expect(completeLine(root, ROOT_ID, 'reminder edit rmd-1')[0]).toEqual(['rmd-1234 ']);
  });
});
