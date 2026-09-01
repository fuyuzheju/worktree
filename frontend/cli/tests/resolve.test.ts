import { describe, expect, it } from 'vitest';
import { ROOT_ID, Tree } from '@worktree/core';
import { AmbiguousRefError, pathOf, resolveRef } from '../src/resolve';

const build = () =>
  Tree.fromOps([
    { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1111', name: 'alpha', weight: 1 },
    { kind: 'add', parentId: ROOT_ID, id: 'bbbb-2222', name: 'beta', weight: 2 },
    { kind: 'add', parentId: 'aaaa-1111', id: 'cccc-3333', name: 'beta', weight: 1 },
    { kind: 'add', parentId: 'cccc-3333', id: 'dddd-4444', name: 'gamma', weight: 1 },
  ]);

const alpha = () => {
  const root = build().getRoot();
  return root.children.find((c) => c.id === 'aaaa-1111')!;
};

describe('resolveRef', () => {
  it('resolves root aliases', () => {
    const root = build().getRoot();
    expect(resolveRef(root, 'root').id).toBe(ROOT_ID);
    expect(resolveRef(root, '.').id).toBe(ROOT_ID);
    expect(resolveRef(root, '/').id).toBe(ROOT_ID);
    expect(resolveRef(root, ROOT_ID).id).toBe(ROOT_ID);
  });

  it('resolves by exact id', () => {
    expect(resolveRef(build().getRoot(), 'bbbb-2222').name).toBe('beta');
  });

  it('resolves by unique id prefix', () => {
    const found = resolveRef(build().getRoot(), 'cccc');
    expect(found.id).toBe('cccc-3333');
    expect(found.name).toBe('beta');
  });

  it('resolves a bare name to the cwd child first', () => {
    const root = build().getRoot();
    expect(resolveRef(root, 'beta').id).toBe('bbbb-2222');
    expect(resolveRef(root, 'beta', alpha()).id).toBe('cccc-3333');
  });

  it('rejects ambiguous names outside the cwd and lists the candidates', () => {
    const root = build().getRoot();
    const leaf = root.children.find((c) => c.id === 'bbbb-2222'); // root's beta: a leaf
    if (leaf === undefined) throw new Error('missing leaf');
    try {
      resolveRef(root, 'beta', leaf);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AmbiguousRefError);
      if (!(e instanceof AmbiguousRefError)) throw new Error('expected AmbiguousRefError');
      expect(e.message).toContain('beta [bbbb]');
      expect(e.message).toContain('beta [cccc]');
    }
  });

  it('rejects unknown refs', () => {
    expect(() => resolveRef(build().getRoot(), 'nope')).toThrow(/unknown node reference/);
  });

  it('resolves nodes at any depth', () => {
    expect(resolveRef(build().getRoot(), 'cccc-3333').name).toBe('beta');
  });

  it('resolves absolute paths', () => {
    const root = build().getRoot();
    expect(resolveRef(root, '/alpha').id).toBe('aaaa-1111');
    expect(resolveRef(root, '/alpha/beta').id).toBe('cccc-3333');
    expect(resolveRef(root, '/alpha/beta/gamma').id).toBe('dddd-4444');
  });

  it('resolves relative paths from the cwd', () => {
    const root = build().getRoot();
    expect(resolveRef(root, 'beta', alpha()).id).toBe('cccc-3333');
    expect(resolveRef(root, 'beta/gamma', alpha()).id).toBe('dddd-4444');
    expect(resolveRef(root, '/beta', alpha()).id).toBe('bbbb-2222');
  });

  it('supports . and .. segments in paths', () => {
    const root = build().getRoot();
    const gamma = root.children[0]!.children[0]!.children[0]!;
    expect(resolveRef(root, '.', alpha()).id).toBe('aaaa-1111');
    expect(resolveRef(root, '..', alpha()).id).toBe(ROOT_ID);
    expect(resolveRef(root, '..', gamma).id).toBe('cccc-3333');
    expect(resolveRef(root, '../..', gamma).id).toBe('aaaa-1111');
    expect(resolveRef(root, '/alpha/./beta/..', gamma).id).toBe('aaaa-1111');
    expect(resolveRef(root, '/..').id).toBe(ROOT_ID);
  });

  it('rejects paths with unknown segments', () => {
    const root = build().getRoot();
    expect(() => resolveRef(root, '/alpha/nope')).toThrow(/no such node: nope/);
    expect(() => resolveRef(root, 'nope/child', alpha())).toThrow(/no such node: nope/);
  });

  it('pathOf prints the absolute path of a node', () => {
    const root = build().getRoot();
    expect(pathOf(root, ROOT_ID)).toBe('/');
    expect(pathOf(root, 'aaaa-1111')).toBe('/alpha');
    expect(pathOf(root, 'cccc-3333')).toBe('/alpha/beta');
    expect(pathOf(root, 'dddd-4444')).toBe('/alpha/beta/gamma');
    expect(pathOf(root, 'missing')).toBe('/');
  });
});
