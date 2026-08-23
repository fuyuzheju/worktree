/** Milliseconds since the Unix epoch. */
export type Timestamp = number;

export interface Reminder {
  id: string;
  name: string;
  deadline: Timestamp;
  /** Recurrence interval in milliseconds; absent for one-shot reminders. */
  repeat?: Timestamp;
  active: boolean;
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
}

/**
 * Operations applied to the Node tree. All ids are client-generated UUIDs.
 * `copy` is shallow: it copies name, status and reminders, not children.
 * `copy.name` defaults to the source name.
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
      /** Defaults to 0 on replay (legacy ops lack it); clients set Date.now(). */
      createdAt?: Timestamp;
    }
  | { kind: 'remove'; id: string }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'move'; id: string; parentId: string; weight: number }
  | { kind: 'copy'; id: string; parentId: string; newId: string; weight: number; name?: string }
  | { kind: 'complete'; id: string }
  | { kind: 'uncomplete'; id: string }
  | { kind: 'add_reminder'; nodeId: string; rmdId: string; name: string; deadline: Timestamp; repeat?: Timestamp }
  | { kind: 'remove_reminder'; rmdId: string }
  | {
      kind: 'edit_reminder';
      rmdId: string;
      name?: string;
      deadline?: Timestamp;
      /** null clears the repeat; absent = unchanged. */
      repeat?: Timestamp | null;
      active?: boolean;
    }
  | {
      kind: 'edit_node';
      id: string;
      note?: string;
      /** null clears the deadline; absent = unchanged. */
      deadline?: Timestamp | null;
    };

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
  op: TreeOperation;
}

/** Operations on the history log. `remove` is an undo: it may only delete the head. */
export type HistoryOperation =
  | { kind: 'add'; id: string; op: TreeOperation }
  | { kind: 'remove'; id: string };

/** The history: an ordered list of HistoryNodes in server append order. */
export type History = HistoryNode[];

/** Server lifecycle state. */
export type ServerState = 'working' | 'offline';
