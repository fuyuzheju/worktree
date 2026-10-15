import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAPTURE_PATH,
  ROOT_ID,
  WorktreeState,
  captureName,
  captureNote,
  displayPathOf,
  normalizeCapturePath,
  operationSchema,
  planCapture,
} from '../src/index';
import type { CaptureEntry, Node, Operation } from '../src/index';

const add = (id: string, parentId = ROOT_ID, name = id, weight = 1): Operation => ({
  kind: 'add',
  parentId,
  id,
  name,
  weight,
});

/** Deterministic id factory for auto-created segments: seg-1, seg-2, ... */
function segIds(): () => string {
  let n = 0;
  return () => `seg-${++n}`;
}

function plan(state: WorktreeState, text: string, path = DEFAULT_CAPTURE_PATH, id = 'cap-1') {
  return planCapture(state, { id, text, path, timestamp: 1000, createId: segIds() });
}

function applyEntries(state: WorktreeState, entries: CaptureEntry[]): void {
  for (const e of entries) state.apply(e.op);
}

function nodeOf(state: WorktreeState, id: string): Node {
  const node = state.tree.getNode(id);
  if (node === undefined) throw new Error(`missing node ${id}`);
  return node;
}

describe('captureName / captureNote', () => {
  it('splits on the first line', () => {
    expect(captureName('买牛奶 明天\n顺路去超市\n第二行')).toBe('买牛奶 明天');
    expect(captureNote('买牛奶 明天\n顺路去超市\n第二行')).toBe('顺路去超市\n第二行');
    expect(captureNote('only a name')).toBe('');
  });

  it('trims and rejects an empty name or one containing "/"', () => {
    expect(captureName('  spaced  ')).toBe('spaced');
    // The whole text is trimmed first, so leading blank lines disappear.
    expect(captureName('   \nnote only')).toBe('note only');
    expect(() => captureName('')).toThrow(/capture text is empty/);
    expect(() => captureName('   ')).toThrow(/capture text is empty/);
    expect(() => captureName('a/b')).toThrow(/must not contain "\/"/);
  });
});

describe('normalizeCapturePath', () => {
  it('splits, drops "" and ".", keeps the rest', () => {
    expect(normalizeCapturePath('/tmp')).toEqual(['tmp']);
    expect(normalizeCapturePath('/')).toEqual([]);
    expect(normalizeCapturePath('/a/b/')).toEqual(['a', 'b']);
    expect(normalizeCapturePath('//a//b//')).toEqual(['a', 'b']);
    expect(normalizeCapturePath('/./a/.')).toEqual(['a']);
  });

  it('rejects relative paths and ".." segments', () => {
    expect(() => normalizeCapturePath('tmp')).toThrow(/must start with "\/"/);
    expect(() => normalizeCapturePath('/a/../b')).toThrow(/must not contain "\.\."/);
    expect(() => normalizeCapturePath('/..')).toThrow(/must not contain "\.\."/);
  });
});

describe('planCapture', () => {
  it('auto-creates /tmp and puts the node on top of it', () => {
    const state = new WorktreeState();
    const result = plan(state, '买牛奶');
    expect(result.entries.map((e) => e.id)).toEqual(['seg-1', 'cap-1']);
    expect(result.nodeId).toBe('cap-1');
    expect(result.name).toBe('买牛奶');
    expect(result.displayPath).toBe('/tmp/买牛奶');

    expect(state.tree.getNode('seg-1')).toBeUndefined(); // dry-run only: input untouched
    applyEntries(state, result.entries);
    const tmp = nodeOf(state, 'seg-1');
    expect(tmp.name).toBe('tmp');
    expect(tmp.weight).toBe(1); // appended after root's (empty) children
    expect(nodeOf(state, 'cap-1').weight).toBe(0); // first child sits at 0
    expect(state.tree.getParentId('cap-1')).toBe('seg-1');
  });

  it('creates every missing segment in order and leaves existing ones untouched', () => {
    const state = WorktreeState.fromOps([add('a1', ROOT_ID, 'a', 7)]);
    const result = plan(state, 'x', '/a/b/c');
    expect(result.entries.map((e) => e.op.kind)).toEqual(['add', 'add', 'add']);
    applyEntries(state, result.entries);
    const nodeA = nodeOf(state, 'a1');
    expect(nodeA.weight).toBe(7);
    const b = nodeA.children.find((c) => c.name === 'b');
    if (b === undefined) throw new Error('missing b');
    const c = b.children.find((n) => n.name === 'c');
    if (c === undefined) throw new Error('missing c');
    expect(c.children.map((n) => n.name)).toEqual(['x']);
    expect(result.displayPath).toBe('/a/b/c/x');
  });

  it('suffixes a sibling name collision with (2), (3), ...', () => {
    const state = WorktreeState.fromOps([
      add('tmp', ROOT_ID, 'tmp', 1),
      add('m1', 'tmp', '买牛奶', 1),
      add('m2', 'tmp', '买牛奶 (2)', 2),
    ]);
    const result = plan(state, '买牛奶');
    expect(result.name).toBe('买牛奶 (3)');
    expect(result.displayPath).toBe('/tmp/买牛奶 (3)');
  });

  it('place the node above the lowest sibling weight, including completed ones', () => {
    const state = WorktreeState.fromOps([
      add('tmp', ROOT_ID, 'tmp', 1),
      add('low', 'tmp', 'low', -4),
      add('done', 'tmp', 'done', 0),
      { kind: 'complete', id: 'done' },
    ]);
    const result = plan(state, 'x');
    applyEntries(state, result.entries);
    expect(nodeOf(state, 'cap-1').weight).toBe(-5);
    expect(nodeOf(state, 'tmp').children[0]?.name).toBe('x');
  });

  it('carries the note and the timestamp into the ops', () => {
    const state = new WorktreeState();
    const result = plan(state, 'name line\nnote line 1\nnote line 2');
    const op = result.entries.at(-1)?.op;
    expect(op?.kind === 'add' && op.note).toBe('note line 1\nnote line 2');
    for (const entry of result.entries) {
      expect(entry.op.timestamp).toBe(1000);
      expect(operationSchema.safeParse(entry.op).success).toBe(true);
    }
    const single = plan(new WorktreeState(), 'just a name');
    const singleOp = single.entries.at(-1)?.op;
    expect(singleOp?.kind === 'add' && singleOp.note).toBeUndefined();
  });

  it('rejects an empty text, a name with "/" and a bad path', () => {
    const state = new WorktreeState();
    expect(() => plan(state, '')).toThrow(/capture text is empty/);
    expect(() => plan(state, 'a/b')).toThrow(/must not contain "\/"/);
    expect(() => plan(state, 'x', 'tmp')).toThrow(/must start with "\/"/);
    expect(() => plan(state, 'x', '/a/../b')).toThrow(/must not contain "\.\."/);
  });

  it('captures at the root for the path "/"', () => {
    const state = new WorktreeState();
    const result = plan(state, 'x', '/');
    expect(result.entries).toHaveLength(1);
    expect(result.displayPath).toBe('/x');
    applyEntries(state, result.entries);
    expect(state.tree.getParentId('cap-1')).toBe(ROOT_ID);
  });
});

describe('displayPathOf', () => {
  it('walks the parent chain and returns null for unknown nodes', () => {
    const state = WorktreeState.fromOps([add('a', ROOT_ID, 'a'), add('b', 'a', 'b')]);
    expect(displayPathOf(state.tree, 'b')).toBe('/a/b');
    expect(displayPathOf(state.tree, 'gone')).toBeNull();
    expect(displayPathOf(state.tree, ROOT_ID)).toBe('/');
  });
});
