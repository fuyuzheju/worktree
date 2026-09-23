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
  /** True for reminders auto-created from the node's deadline. */
  auto: boolean;
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

/** Recurrence frequency of a BlockRule. */
export type RuleFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** A date in the proleptic Gregorian calendar (no time, no timezone). */
export interface CivilDate {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..31, must exist in the month */
  day: number;
}

/** A time of day, in whole minutes. */
export interface CivilTime {
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
}

/**
 * A recurring calendar rule. Occurrences are derived by expansion
 * (see schedule.ts) and never stored; `startDate` anchors both the interval
 * phase and the first candidate day. `tzOffset` is the rule's fixed offset
 * from UTC in ms (whole minutes); every civil conversion uses it, so
 * occurrences are stable across the device's own timezone.
 */
export interface BlockRule {
  id: string;
  /** Non-empty. */
  name: string;
  /** Detailed description; '' when unset. */
  note: string;
  freq: RuleFreq;
  /** >= 1; daily = days, weekly = weeks, monthly = months, yearly = years. */
  interval: number;
  startDate: CivilDate;
  timeOfDay: CivilTime;
  /** Occurrence length in ms; > 0. */
  duration: Timestamp;
  /** 0 = Sunday .. 6 = Saturday. Weekly only (default: the anchor's weekday). */
  byDay?: number[];
  /** 1..31 or -1 (last day of the month). Monthly only (default: the anchor's day). */
  byMonthDay?: number[];
  /** 1..12. Yearly only (default: the anchor's month). */
  byMonth?: number[];
  /** Nonzero, |n| <= 5; monthly + byDay only (nth / last such weekday of the month). */
  bySetPos?: number;
  /** Inclusive upper bound on the occurrence start. */
  until?: Timestamp;
  /** Offset of the rule's local time from UTC in ms; whole minutes, not editable. */
  tzOffset: number;
  /** false = the rule contributes no occurrences (it is still listed). */
  active: boolean;
}

/** A rule occurrence, derived by expansion — never stored in the history. */
export interface BlockOccurrence {
  ruleId: string;
  /** Civil day index (days since 1970-01-01) in the rule's tzOffset; the skip key. */
  day: number;
  /** Start of the occurrence in ms. */
  occStart: Timestamp;
  /** End of the occurrence in ms. */
  occEnd: Timestamp;
  /** Display key: `${ruleId}:${day}`. */
  id: string;
  name: string;
  note: string;
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
      /** Marks an auto-generated deadline reminder; defaults to false on replay. */
      auto?: boolean;
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
 * `edit_block_rule` patches follow the same convention (`null` = clear);
 * `tzOffset` is not a patchable field — it fixes the rule's occurrence
 * identities. Every op carries a client-generated `timestamp` (see
 * TreeOperation).
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
  | { kind: 'uncomplete_block'; id: string; timestamp?: Timestamp }
  | {
      kind: 'add_block_rule';
      id: string;
      name: string;
      freq: RuleFreq;
      interval: number;
      startDate: CivilDate;
      timeOfDay: CivilTime;
      duration: Timestamp;
      byDay?: number[];
      byMonthDay?: number[];
      byMonth?: number[];
      bySetPos?: number;
      until?: Timestamp;
      tzOffset: number;
      note?: string;
      timestamp?: Timestamp;
    }
  | {
      kind: 'edit_block_rule';
      id: string;
      name?: string;
      note?: string;
      freq?: RuleFreq;
      interval?: number;
      startDate?: CivilDate;
      timeOfDay?: CivilTime;
      duration?: Timestamp;
      byDay?: number[] | null;
      byMonthDay?: number[] | null;
      byMonth?: number[] | null;
      bySetPos?: number | null;
      until?: Timestamp | null;
      active?: boolean;
      timestamp?: Timestamp;
    }
  | { kind: 'remove_block_rule'; id: string; timestamp?: Timestamp }
  | { kind: 'skip_occurrence'; ruleId: string; day: number; timestamp?: Timestamp }
  | { kind: 'unskip_occurrence'; ruleId: string; day: number; timestamp?: Timestamp };

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
