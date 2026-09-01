import { describe, expect, it } from 'vitest';
import { Tree } from '@worktree/core';
import { ROOT_ID } from '@worktree/core';
import type { Node, TreeOperation } from '@worktree/core';
import { connectors, formatNode, formatReminder, shortId } from '../src/render';
import type { DisplayPrefs } from '../src/config';

const fullDisplay: DisplayPrefs = { showId: true, showWeight: true, showReminders: true, filterMode: 'hide' };

describe('shortId', () => {
  it('truncates ids to 4 characters', () => {
    expect(shortId('abcdef-1234')).toBe('abcd');
    expect(shortId('ab')).toBe('ab');
  });
});

describe('formatNode', () => {
  const node = (ops: TreeOperation[]): Node => Tree.fromOps(ops).getRoot().children[0];

  it('formats like the CLI: name [id4] w:weight', () => {
    const n = node([{ kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 }]);
    expect(formatNode(n, fullDisplay)).toBe('a [aaaa] w:1');
  });

  it('marks completed nodes with a checkmark', () => {
    const n = node([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'complete', id: 'aaaa-1' },
    ]);
    expect(formatNode(n, fullDisplay)).toBe('a [aaaa] ✔ w:1');
  });

  it('shows reminders inline with ISO deadline, repeat and inactive marker', () => {
    const n = node([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'add_reminder', nodeId: 'aaaa-1', rmdId: 'r1', name: 'R', deadline: 1000, repeat: 60 },
      { kind: 'add_reminder', nodeId: 'aaaa-1', rmdId: 'r2', name: 'S', deadline: 2000 },
      { kind: 'edit_reminder', rmdId: 'r2', active: false },
    ]);
    const out = formatNode(n, fullDisplay);
    expect(out).toContain('R(2):R@1970-01-01T00:00:01.000Z+60ms, S@1970-01-01T00:00:02.000Z/off');
  });

  it('honors display toggles', () => {
    const n = node([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1 },
      { kind: 'add_reminder', nodeId: 'aaaa-1', rmdId: 'r1', name: 'R', deadline: 1000 },
    ]);
    expect(formatNode(n, { ...fullDisplay, showId: false, showWeight: false, showReminders: false })).toBe('a');
    expect(formatNode(n, { ...fullDisplay, showId: false, showWeight: true, showReminders: false })).toBe('a w:1');
    expect(formatNode(n, { ...fullDisplay, showId: true, showWeight: false, showReminders: true })).toContain(
      '[aaaa] R(1):',
    );
  });

  it('shows deadline and note tokens only when present', () => {
    const n = node([
      { kind: 'add', parentId: ROOT_ID, id: 'aaaa-1', name: 'a', weight: 1, deadline: 1000, note: 'hi' },
    ]);
    expect(formatNode(n, fullDisplay)).toBe('a [aaaa] w:1 ⏰1970-01-01T00:00:01.000Z ✎ hi');
    const plain = node([{ kind: 'add', parentId: ROOT_ID, id: 'bbbb-1', name: 'b', weight: 1 }]);
    expect(formatNode(plain, fullDisplay)).toBe('b [bbbb] w:1');
  });
});

describe('formatReminder', () => {
  it('formats a plain reminder', () => {
    expect(formatReminder({ id: 'r1', name: 'R', deadline: 1000, active: true })).toBe(
      'R@1970-01-01T00:00:01.000Z',
    );
  });

  it('omits the name when absent', () => {
    expect(formatReminder({ id: 'r1', deadline: 1000, active: true })).toBe(
      '@1970-01-01T00:00:01.000Z',
    );
  });
});

describe('connectors', () => {
  it('builds tree-command prefixes', () => {
    expect(connectors([], false)).toBe('├── ');
    expect(connectors([], true)).toBe('└── ');
    expect(connectors([false, false], true)).toBe('│   │   └── ');
    expect(connectors([true, false], false)).toBe('    │   ├── ');
  });
});

