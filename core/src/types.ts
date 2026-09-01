/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

export interface Reminder {
  id: string;
  /** Display name; absent for unnamed reminders. */
  name?: string;
  deadline: Timestamp;
  /** Recurrence interval in milliseconds; absent for one-shot reminders. */
  repeat?: Timestamp;
  active: boolean;
}

export interface Block {
  id: string;
  /** Non-empty. */
  name: string;
  /** Period start in ms. */
  start: Timestamp;
  /** Period end in ms; start < end. */
  end: Timestamp;
  /** Detailed description; '' when unset. */
  note: string;
  /** true = completed */
  status: boolean;
  /** Linked worktree node; absent = standalone block. At most one block links a node. */
  nodeId?: string;
}

export interface Node {
  id: string;
  /** Non-empty, must not contain '/'; unique among siblings (enforced by Tree). */
  name: string;
  /** Ordering weight among siblings (smaller = earlier); ties are broken by id. */
  weight: number;
  children: Node[];
  reminders: Reminder[];
  /** true = completed */
  status: boolean;
  /** Detailed description; '' when unset. */
  note: string;
  /** Creation time in ms; 0 for nodes created by legacy ops. */
  createdAt: Timestamp;
  /** Task deadline; absent for nodes without one. */
  deadline?: Timestamp;
  /** Completion time in ms; 0 when uncompleted or completed by a legacy op. */
  completedAt: Timestamp;
}

/**
 * Operations applied to the Node tree. All ids are client-generated UUIDs.
 * `copy` is shallow: it copies name, status and reminders, not children.
 * `copy.name` defaults to the source name.
 * Every op carries a client-generated `timestamp` (creation time of the op,
 * in ms); it is absent only in ops persisted before the field existed.
 */
export type TreeOperation =
  | {
      kind: 'add';
      parentId: string;
      id: string;
      name: string;
      weight: number;
      /** Defaults to '' on replay (legacy ops lack it). */
      note?: string;
      /** Defaults to unset on replay (legacy ops lack it). */
      deadline?: Timestamp;
      /** Defaults to `timestamp` on replay (legacy ops lack it). */
      createdAt?: Timestamp;
      timestamp?: Timestamp;
    }
  | { kind: 'remove'; id: string; timestamp?: Timestamp }
  | { kind: 'rename'; id: string; name: string; timestamp?: Timestamp }
  | { kind: 'move'; id: string; parentId: string; weight: number; timestamp?: Timestamp }
  | { kind: 'copy'; id: string; parentId: string; newId: string; weight: number; name?: string; timestamp?: Timestamp }
  | { kind: 'complete'; id: string; timestamp?: Timestamp }
  | { kind: 'uncomplete'; id: string; timestamp?: Timestamp }
  | {
      kind: 'add_reminder';
      nodeId: string;
      rmdId: string;
      name?: string;
      deadline: Timestamp;
      repeat?: Timestamp;
      timestamp?: Timestamp;
    }
  | { kind: 'remove_reminder'; rmdId: string; timestamp?: Timestamp }
  | {
      kind: 'edit_reminder';
      rmdId: string;
      name?: string;
      deadline?: Timestamp;
      /** null clears the repeat; absent = unchanged. */
      repeat?: Timestamp | null;
      active?: boolean;
      timestamp?: Timestamp;
    }
  | {
      kind: 'edit_node';
      id: string;
      note?: string;
      /** null clears the deadline; absent = unchanged. */
      deadline?: Timestamp | null;
      timestamp?: Timestamp;
    };

/**
 * Operations applied to the calendar. All ids are client-generated UUIDs.
 * `edit_block.nodeId`: null clears the link; absent = unchanged.
 * Every op carries a client-generated `timestamp` (see TreeOperation).
 */
export type CalendarOperation =
  | { kind: 'add_block'; id: string; name: string; start: Timestamp; end: Timestamp; note?: string; nodeId?: string; timestamp?: Timestamp }
  | { kind: 'remove_block'; id: string; timestamp?: Timestamp }
  | {
      kind: 'edit_block';
      id: string;
      name?: string;
      start?: Timestamp;
      end?: Timestamp;
      note?: string;
      nodeId?: string | null;
      timestamp?: Timestamp;
    }
  | { kind: 'complete_block'; id: string; timestamp?: Timestamp }
  | { kind: 'uncomplete_block'; id: string; timestamp?: Timestamp };

/** Any operation the history may hold: tree domain or calendar domain. */
export type Operation = TreeOperation | CalendarOperation;

/** Display/selection criteria. All fields optional; undefined fields are unconstrained.
 *  Bounds are inclusive; keyword matching is case-insensitive. */
export interface NodeFilter {
  /** Matches when the node's name OR note contains the keyword (case-insensitive). */
  keyword?: string;
  nameContains?: string;
  noteContains?: string;
  /** node.deadline <= deadlineBefore (node must have a deadline). */
  deadlineBefore?: Timestamp;
  hasDeadline?: boolean;
  /** Deadline set, not completed, and deadline < now. */
  overdue?: boolean;
  /** node.createdAt >= createdAfter. */
  createdAfter?: Timestamp;
  /** node.createdAt <= createdBefore. */
  createdBefore?: Timestamp;
  /** true = only completed nodes; false = only uncompleted ones. */
  status?: boolean;
}

/** Filtered tree view: matched nodes plus the ancestor chain as context. */
export interface FilteredNode {
  node: Node;
  /** True when the node itself matches; false for context ancestors. */
  matched: boolean;
  children: FilteredNode[];
}

/** An entry of the history log. `id` is the op's client-generated UUID. */
export interface HistoryNode {
  id: string;
  op: Operation;
}

/** Operations on the history log. `remove` is an undo: it may only delete the head. */
export type HistoryOperation =
  | { kind: 'add'; id: string; op: Operation }
  | { kind: 'remove'; id: string };

/** The history: an ordered list of HistoryNodes in server append order. */
export type History = HistoryNode[];

/** Server lifecycle state. */
export type ServerState = 'working' | 'offline';
