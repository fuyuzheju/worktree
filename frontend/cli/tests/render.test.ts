import { afterEach, describe, expect, it } from 'vitest';
import { ROOT_ID, Tree } from '@worktree/core';
import { renderTree, setColorEnabled, shortId } from '../src/render';

afterEach(() => setColorEnabled(false));

describe('shortId', () => {
  it('truncates ids to 4 characters', () => {
    expect(shortId('abcdef-1234')).toBe('abcd');
    expect(shortId('ab')).toBe('ab');
  });
});

describe('renderTree', () => {
  it('renders a flat tree in linux tree format', () => {
    const tree = Tree.fromOps([
      { kind: 'add', parentId: ROOT_ID, id: 'node-a', name: 'alpha', weight: 1 },
      { kind: 'add', parentId: ROOT_ID, id: 'node-b', name: 'beta', weight: 2 },
    ]);
    expect(renderTree(tree.getRoot())).toBe(['.', '├── alpha [node] w:1', '└── beta [node] w:2'].join('\n'));
  });

  it('renders nested levels with continuation bars', () => {
    const tree = Tree.fromOps([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'b', weight: 1 },
      { kind: 'add', parentId: 'bbbb-1', id: 'cccc-1', name: 'c', weight: 1 },
      { kind: 'add', parentId: 'aaaa-1', id: 'dddd-1', name: 'd', weight: 2 },
    ]);
    expect(renderTree(tree.getRoot())).toBe(
      [
        '.',
        '└── a [aaaa] w:1',
        '    ├── b [bbbb] w:1',
        '    │   └── c [cccc] w:1',
        '    └── d [dddd] w:2',
      ].join('\n'),
    );
  });

  it('marks completed nodes and shows reminders inline', () => {
    const tree = Tree.fromOps([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'complete', id: 'aaaa-1' },
      { kind: 'add_reminder', nodeId: 'aaaa-1', rmdId: 'r1', name: 'R', deadline: 1000, repeat: 60 },
    ]);
    const out = renderTree(tree.getRoot());
    expect(out).toContain('a [aaaa] ✔ w:1');
    expect(out).toContain('R(1):R@1970-01-01T00:00:01.000Z+60ms');
  });

  it('renders a subtree with the node itself as the root line', () => {
    const tree = Tree.fromOps([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'add', parentId: 'aaaa-1', id: 'bbbb-1', name: 'b', weight: 1 },
    ]);
    const a = tree.getNode('aaaa-1')!;
    expect(renderTree(a)).toBe(['a [aaaa] w:1', '└── b [bbbb] w:1'].join('\n'));
  });

  it('marks inactive reminders', () => {
    const tree = Tree.fromOps([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'add_reminder', nodeId: 'aaaa-1', rmdId: 'r1', name: 'R', deadline: 1000 },
      { kind: 'edit_reminder', rmdId: 'r1', active: false },
    ]);
    expect(renderTree(tree.getRoot())).toContain('R(1):R@1970-01-01T00:00:01.000Z/off');
  });
});

describe('renderTree colors', () => {
  const coloredTree = () =>
    Tree.fromOps([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'add', parentId: ROOT_ID, id: 'bbbb-1', name: 'b', weight: 2 },
      { kind: 'complete', id: 'aaaa-1' },
    ]);

  it('colors completed nodes green and uncompleted yellow when enabled', () => {
    setColorEnabled(true);
    const out = renderTree(coloredTree().getRoot());
    expect(out).toContain('\x1b[32ma [aaaa] ✔ w:1\x1b[0m');
    expect(out).toContain('\x1b[33mb [bbbb] w:2\x1b[0m');
  });

  it('leaves the root line uncolored', () => {
    setColorEnabled(true);
    const out = renderTree(coloredTree().getRoot());
    expect(out.startsWith('.')).toBe(true);
    expect(out).not.toContain('\x1b[33m.');
  });

  it('emits no escape codes when colors are disabled (piped output)', () => {
    setColorEnabled(false);
    const out = renderTree(coloredTree().getRoot());
    expect(out).not.toContain('\x1b[');
    expect(out).toContain('a [aaaa] ✔ w:1');
  });
});
