import type { WorktreeState } from './state';
import { ROOT_ID } from './tree';
import type { Tree } from './tree';
import type { HistoryOperation, Node, Operation, Timestamp } from './types';

/** The parent path a capture lands under when the caller does not override it. */
export const DEFAULT_CAPTURE_PATH = '/tmp';

/** An 'add' history entry: what planCapture produces and every caller enqueues or appends. */
export type CaptureEntry = Extract<HistoryOperation, { kind: 'add' }>;

export interface CaptureRequest {
  /**
   * The captured node's id, also used as its history entry id — the retry key
   * of /api/capture: the same id must never plan a second node.
   */
  id: string;
  /** Raw capture text: the first line becomes the name, the rest the note. */
  text: string;
  /** Absolute path of the parent node, e.g. '/tmp'. */
  path: string;
  /** Stamped on every op the plan creates (add op timestamps keep replay deterministic). */
  timestamp: Timestamp;
  /** Id factory for auto-created path segments (injectable for tests). */
  createId: () => string;
}

export interface CapturePlan {
  /** 'add' entries in apply order: auto-created path segments, then the node. */
  entries: CaptureEntry[];
  /** The captured node's id (== request.id). */
  nodeId: string;
  /** The node's name — suffixed with ` (2)`, ` (3)`, ... on a sibling collision. */
  name: string;
  /** Display path like `/tmp/买牛奶`, for CLI output, the web overlay and API responses. */
  displayPath: string;
}

/** The node name a capture text names: its first line, trimmed. */
export function captureName(text: string): string {
  const first = (text.trim().split('\n')[0] ?? '').trim();
  if (first === '') throw new Error('capture text is empty');
  if (first.includes('/')) throw new Error(`capture name must not contain "/": ${first}`);
  return first;
}

/** The note a capture text carries: everything after its first line. */
export function captureNote(text: string): string {
  return text
    .trim()
    .split('\n')
    .slice(1)
    .join('\n')
    .trim();
}

/**
 * Splits a capture path into the parent's segments. Must start with '/'; `''`
 * and `.` segments are dropped; `..` throws — in CLI refs `..` walks up, so
 * quietly creating a node literally named `..` would be a trap. `/` alone
 * means the root.
 */
export function normalizeCapturePath(path: string): string[] {
  if (!path.startsWith('/')) throw new Error(`capture path must start with "/": ${path}`);
  const segments = path.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) throw new Error(`capture path must not contain "..": ${path}`);
  return segments;
}

/**
 * Plans the ops a capture needs, without applying them to `state`: resolve the
 * parent path (auto-creating missing segments), pick a free name (`name`,
 * `name (2)`, ...) and place the node on top. This is the single source of the
 * capture semantics — the client kernel and the server's /api/capture both
 * plan through it, so every entry point produces the same ordinary add ops and
 * replay, undo and conflict handling need no capture awareness.
 *
 * The plan is dry-run on a clone as it is built, so a rejected capture throws
 * here and leaves the caller's state untouched.
 */
export function planCapture(state: WorktreeState, req: CaptureRequest): CapturePlan {
  const segments = normalizeCapturePath(req.path);
  const baseName = captureName(req.text);
  const note = captureNote(req.text);

  const probe = state.clone();
  const entries: CaptureEntry[] = [];
  let parent = probe.tree.getRoot();
  for (const segment of segments) {
    const existing = parent.children.find((c) => c.name === segment);
    if (existing !== undefined) {
      parent = existing;
      continue;
    }
    const id = req.createId();
    const op: Operation = {
      kind: 'add',
      parentId: parent.id,
      id,
      name: segment,
      weight: appendWeight(parent.children),
      timestamp: req.timestamp,
    };
    probe.apply(op);
    entries.push({ kind: 'add', id, op });
    const created = probe.tree.getNode(id);
    if (created === undefined) throw new Error(`capture plan lost created segment: ${segment}`);
    parent = created;
  }

  const name = uniqueCaptureName(parent.children, baseName);
  const op: Operation = {
    kind: 'add',
    parentId: parent.id,
    id: req.id,
    name,
    weight: topWeight(parent.children),
    note: note === '' ? undefined : note,
    timestamp: req.timestamp,
  };
  probe.apply(op);
  entries.push({ kind: 'add', id: req.id, op });

  return { entries, nodeId: req.id, name, displayPath: `/${[...segments, name].join('/')}` };
}

/** The display path of a live node (`/tmp/买牛奶`); null when the node no longer exists. */
export function displayPathOf(tree: Tree, nodeId: string): string | null {
  const segments: string[] = [];
  let cur = nodeId;
  for (;;) {
    const node = tree.getNode(cur);
    if (node === undefined) return null;
    if (node.id === ROOT_ID) break;
    segments.unshift(node.name);
    const parentId = tree.getParentId(cur);
    if (parentId === undefined) return null;
    cur = parentId;
  }
  return `/${segments.join('/')}`;
}

/** First free name among the parent's children: `name`, then `name (2)`, `name (3)`, ... */
function uniqueCaptureName(children: Node[], name: string): string {
  const taken = new Set(children.map((c) => c.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Auto-created path segments append after their siblings. */
function appendWeight(children: Node[]): number {
  return children.reduce((max, c) => Math.max(max, c.weight), 0) + 1;
}

/** The captured node lands on top of its siblings. */
function topWeight(children: Node[]): number {
  if (children.length === 0) return 0;
  return children.reduce((min, c) => Math.min(min, c.weight), Infinity) - 1;
}
