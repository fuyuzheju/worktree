User:
name: string, /^[a-zA-Z0-9._-]{1,64}$/ — the identity; requests authenticate with
a bearer token that resolves to this name (Authorization: Bearer / ?token=).
"local" is a reserved client-side-only name: its data never leaves the device.

Reminder:
id: string,
name: string | undefined,  // display name; absent for unnamed reminders
deadline: timestamp,
repeat: time | undefined,   // recurrence interval in ms; undefined = one-shot
active: boolean,            // false disables firing without deleting
auto: boolean,              // true for reminders auto-created from a node deadline;
                            // legacy add_reminder ops replay to false

Auto-reminders (a client-side convenience, not a server feature): the frontends
offer "remind me pct% of the way through the creation→deadline window"
(autoReminderPct, default 15, clamp 1..99). It is device configuration, never
part of an op, and is added as an ordinary add_reminder with auto: true — the
server only ever sees reminder ops and the replay stays deterministic.
- Created the first time an add/edit_node sets a deadline on a node that had
  none, when the deadline is in the future and the node has a createdAt; the
  deadline is createdAt + (deadline - createdAt) * (1 - pct/100), rounded to a
  whole ms.
- Follows later deadline edits: recomputed from the node's createdAt, never
  duplicated, and removed when the deadline is cleared (even while the setting
  is off).
- Opt-in per frontend: `setDeadline` without opts creates nothing, and the
  percentage is not stored with the reminder — only its computed deadline is.
- Manual reminders (auto: false) are never touched, and deleting an auto
  reminder is final: a later deadline edit does not recreate it.

Reminder notifications (server-side, Web Push):
- The server sweeps all users' trees every 30s (REMINDER_SWEEP_MS) and fires
  reminders whose latest occurrence T just became due: T = deadline for
  one-shot reminders; T = deadline + k*repeat (largest k with T <= now) for
  recurring ones. REMINDER_SWEEP_MS must be smaller than the 60s fire window
  (the server refuses to start otherwise — a larger interval lets occurrences
  fall between ticks and never fire).
- An occurrence fires only within a 60s window of becoming due
  (now - T < 60s). Occurrences that pass while nothing can deliver are
  skipped permanently — missed reminders are never backfilled.
- Inactive reminders (active: false) and reminders on completed nodes never
  fire.
- Delivery is out-of-band (browser push service), so the app does not need
  to be open. Occurrences are deduped server-side, so restarts cannot
  double-fire.

Node:
id: string,
name: string, (non-empty, must not contain '/')
weight: number,
children: Set[Node],
reminders: Reminder[],
status: boolean, (true for completed, false for uncompleted)
note: string, (detailed description; '' when unset)
createdAt: timestamp, (creation time in ms; 0 for nodes created by legacy ops)
deadline: timestamp | undefined, (task deadline; absent when none)
completedAt: timestamp, (completion time in ms; 0 while uncompleted or completed
by a legacy op — only meaningful when status is true)

Legacy default: ops persisted before these fields existed replay to
note: '', createdAt: 0, completedAt: 0, no deadline — fixed defaults keep replay
deterministic. The same applies to reminders added by legacy add_reminder ops:
they replay with auto: false.

sibling order: uncompleted siblings first, then completed; within each group ascending
(weight, name). weight may collide; names are unique among siblings, so the order is
deterministic across replays. Status and rename ops re-sort the node's siblings.
User weights are "small weights" (e.g. 1, 2, 3): completion status, not weight,
decides which group a node lands in.
sibling names: unique within a parent — names are the path segments clients address nodes by.

Block:
id: string,
name: string, (non-empty)
start: timestamp, (period start, ms)
end: timestamp, (period end, ms; start < end)
note: string, (detailed description; '' when unset)
status: boolean, (true for completed, false for uncompleted)
nodeId: string | undefined, (linked worktree node; absent = standalone block)

At most one block may link a given node.

Blocks and linked nodes propagate completion in both directions. Propagation
is derived state inside a single apply — no extra history ops, so replay is
deterministic and undo/rewrite revert it automatically:
- completing/uncompleting a node completes/uncompletes its linked block
- completing/uncompleting a block completes/uncompletes its linked node
- a new or relinked block starts with its node's status
- only direct links propagate: completing a parent node does not touch the
  blocks of its descendants
Removing a node keeps its linked blocks but clears their nodeId; undoing the
removal restores the links via replay. copy/rename/move leave links intact.

BlockRule (a recurring calendar rule; its occurrences are derived, never stored):
id: string,
name: string, (non-empty)
note: string, (detailed description; '' when unset)
freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
interval: number, (>= 1; daily = days, weekly = weeks, monthly = months, yearly = years)
startDate: {year, month, day}, (civil anchor: the interval phase and the first candidate day)
timeOfDay: {hour, minute}, (0..23 / 0..59, in the rule's own offset)
duration: timestamp, (occurrence length in ms; > 0)
byDay?: number[], (0=Sunday..6=Saturday; weekly weekdays, or monthly weekdays of the month)
byMonthDay?: number[], (1..31, or -1 for the last day of the month; monthly/yearly)
byMonth?: number[], (1..12; yearly)
bySetPos?: number, (nonzero, |n| <= 5; monthly + byDay: the nth such weekday, negative = from the end)
until?: timestamp, (inclusive upper bound on the occurrence start)
tzOffset: number, (ms offset of the rule's local time from UTC, whole minutes, fixed at creation)
active: boolean, (false -> contributes no occurrences; still listed and editable)

Selector scope — anything else is a validation error:
- daily: no selectors.
- weekly: byDay only, defaulting to the anchor's weekday. Intervals count
  weeks from the Monday of the anchor's week.
- monthly: byMonthDay xor byDay (plus optional bySetPos), defaulting to
  byMonthDay = [startDate.day]. Intervals count months from the anchor's month.
- yearly: byMonth + byMonthDay, each defaulting to the anchor's month/day. No
  byDay/bySetPos — "the last Friday of October every year" is a monthly rule
  with interval 12 anchored in October.
Arrays must be non-empty with unique in-range values; startDate must be a real
civil date and not before 1970-01-01. byMonthDay 31 in a short month simply
produces no occurrence that month (RRULE skip semantics — never clamped).

BlockOccurrence (derived by expansion; never materialized as history ops):
{ruleId, day, occStart, occEnd, id, name, note}
day = the civil day index (days since 1970-01-01) in the rule's tzOffset — the
occurrence identity and the skip key. A rule produces at most one occurrence
per civil day (one timeOfDay, byDay xor byMonthDay), so (ruleId, day) is a
bijection with occurrences: a rule-relative date, not an instant, which is why
editing a rule's timeOfDay keeps earlier skips rather than un-skipping them.
occStart = day * 86400000 - tzOffset + timeOfDay, occEnd = occStart + duration
— plain integer math, no Date, no DST. id = `${ruleId}:${day}` (display key).

Expansion is windowed and pure: expand(from, to) returns the occurrences
overlapping [from, to) (occStart < to && occEnd > from), sorted by
(occStart, ruleId). Skipped days, days the schedule does not match and
occurrences past until are excluded; active: false contributes nothing.
Derived model caveat: editing a rule rewrites its past occurrences too — use
until to truncate an old rule and create a new one to affect only the future.

Exceptions (skip_occurrence / unskip_occurrence) hold (ruleId, day) pairs.
The skip set only ever contains days of a currently existing rule that are
occurrences of it — no orphans, maintained by construction:
- skip_occurrence throws for an unknown rule and for a day that is not an
  occurrence (`day is not an occurrence: <ruleId> <day>`); a day already
  skipped is an idempotent no-op. unskip_occurrence rejects the same two cases;
  a day that is not currently skipped is a no-op.
- edit_block_rule clears the rule's skips whenever the patch touches the day
  set — freq, interval, startDate, byDay, byMonthDay, byMonth, bySetPos,
  until. Patches touching only name/note/active/timeOfDay/duration keep them:
  skips are day-keyed, so a time tweak cannot orphan them.
- remove_block_rule (idempotent) deletes the rule together with its skips.
Consequence: a date-set edit drops that rule's exceptions, and a rejected skip
never enters the log — a stale client's skip gets a normal 400 and the pending
op is dropped during conflict resolution. A hand-crafted history that strands a
skip fails replay and is caught by the submit/rewrite probes (or dropped by
repair).
Frontend affordance, not part of the log: before a day-set edit, the frontends
ask about the skips it would drop whose occurrence start is still ahead of now
(the web panel confirms; the CLI lists the dates and needs `--yes`). Skips whose
occurrence already started are dropped without notice. Core and client clear
unconditionally either way — replay never consults a clock.

Every operation (tree and calendar) carries an optional timestamp: the
client-generated creation time of the op in ms. Clients stamp Date.now() on
every op they issue; legacy ops predating the field replay without it.
Timestamps travel inside the op, so replay stays deterministic.
Every timestamp — op stamps, deadlines, block start/end, repeat intervals — is
a whole number of milliseconds. The server validates writes against the op
schema (core/schema.ts), so a fractional value is rejected instead of stored.

TreeOperation:
add(id, new_name, new_id, weight[, note, deadline, created_at][, timestamp]) | 
remove(id[, timestamp]) | 
rename(id, new_name[, timestamp]) | 
move(id, new_parent_id, new_weight[, timestamp]) | 
copy(id, new_parent_id, new_id, new_weight[, new_name][, timestamp]) | 
complete(id[, timestamp]) | 
uncomplete(id[, timestamp]) | 
add_reminder(id, rmd_id[, rmd_name], deadline, repeat[, timestamp]) | 
remove_reminder(rmd_id[, timestamp]) | 
edit_reminder(rmd_id, patch: {
  name?: string,
  deadline?: timestamp,
  repeat?: time | null,   // absent = unchanged; null = clear repeat
  active?: boolean,
}[, timestamp]) | 
edit_node(id, patch: {
  note?: string,
  deadline?: timestamp | null,   // absent = unchanged; null = clear the deadline
}[, timestamp])

add's note/deadline/created_at are optional: they default to '', unset and 0.
Clients no longer send created_at — replay derives it from the op timestamp
(created_at wins when both are present, for legacy reads). A complete op
records its timestamp as the node's completedAt; uncomplete clears it.
A node may only be completed once all of its children are completed (the
check applies to complete_block too, via the propagated node status).
The reverse is derived, inside a single apply and without recording a history
op: uncompleting a node — or introducing an uncompleted node under a completed
parent (add/move/copy) — uncompletes every completed ancestor in turn, so a
completed node never has an uncompleted child in the derived state.
An empty edit_node or edit_reminder patch (no fields at all) is rejected.
add_reminder's `auto` flag is display metadata for the auto-reminder mechanism
(see Reminder above): it changes no validation, and setting a node deadline
produces plain reminder ops — usually one edit_node followed by add_reminder or
edit_reminder/remove_reminder — so nothing about auto-reminders is server-side.

Replay is strict: a stored history containing an entry that apply rejects
(e.g. a complete persisted before the children-first rule existed) fails as a
whole with an error naming the entry. The server marks such a user "broken"
(no submissions; reads and rewrites stay available) and clients freeze at the
last good state until the history is repaired; the repair drops the offending
entries (see sync.md, "broken histories").

Op kinds are strict too: Tree.apply and Calendar.apply switch over every kind,
and a `default` branch narrows the op to `never` and throws — a kind added
without a case is a build error, and an unknown kind aborts the replay loudly
instead of being silently ignored.

copy is shallow: copies name, status, reminders, note, deadline and completedAt,
not children. new_name defaults to the source's name. The copy's createdAt
comes from the copy op's timestamp — 0 for legacy ops, like `add` — never from
apply time, so it is deterministic across replays.

CalendarOperation:
add_block(id, name, start, end[, note, node_id][, timestamp]) |
remove_block(id[, timestamp]) |   // idempotent: removing an unknown block is a no-op
edit_block(id, patch: {
  name?: string,
  start?: timestamp,
  end?: timestamp,    // merged start/end must satisfy start < end
  note?: string,
  nodeId?: string | null,   // absent = unchanged; null = clear the link
}[, timestamp]) |
complete_block(id[, timestamp]) |
uncomplete_block(id[, timestamp]) |
add_block_rule(id, name, freq, interval, start_date, time_of_day, duration,
               tz_offset[, by_day, by_month_day, by_month, by_set_pos, until,
               note][, timestamp]) |
edit_block_rule(id, patch: {
  name?: string,
  note?: string,
  freq?: freq,
  interval?: number,
  startDate?: {year, month, day},
  timeOfDay?: {hour, minute},
  duration?: timestamp,
  byDay?: number[] | null,      // absent = unchanged; null = clear
  byMonthDay?: number[] | null,
  byMonth?: number[] | null,
  bySetPos?: number | null,
  until?: timestamp | null,
  active?: boolean,
}[, timestamp]) |
remove_block_rule(id[, timestamp]) |   // idempotent; drops the rule's skips
skip_occurrence(rule_id, day[, timestamp]) |
unskip_occurrence(rule_id, day[, timestamp])

add_block/edit_block reject a node_id that is already linked by another block
(`node already linked to a block`) and a node_id that does not exist (`unknown
node id`). Empty edit_block patches are rejected. Completing/uncompleting an
unknown block is rejected (like complete).
A complete_block stamps the linked node's completedAt with the op timestamp
(via propagation); uncomplete_block clears it.

add_block_rule validates the rule (see BlockRule above) and rejects a duplicate
id. edit_block_rule rejects an unknown id and an empty patch, revalidates the
merged rule, and clears the rule's skips when the patch touches the day set
(tzOffset is not in the patch, so occurrence identities stay stable). A patch
containing freq resets the selectors it does not itself supply — changing
frequency requires restating the pattern. skip_occurrence/unskip_occurrence
require an existing rule and one of its occurrence days (see Exceptions above).

NodeFilter (client-side display criteria, not part of the persisted log):
keyword?: string,           // name OR note contains it (case-insensitive)
nameContains?: string,
noteContains?: string,
deadlineBefore?: timestamp, // inclusive; requires a deadline
hasDeadline?: boolean,
overdue?: boolean,          // deadline set, not completed, deadline < now
createdAfter?: timestamp,   // inclusive
createdBefore?: timestamp,  // inclusive
status?: boolean,           // true = only completed; false = only uncompleted

Filtering is a pure view concern: matchesFilter/filterTree in core compute it;
the frontends only render the result. The root never matches a filter.

Operation = TreeOperation | CalendarOperation

HistoryNode: {id: string, op: Operation}   // id = op UUID, unique

HistoryOperation:
add(id, op) | 
remove(id)   // undo: delete the entry; only allowed at the head of History

History: HistoryNode[] — per user on the server (each user has their own log)
PendingQueue: Queue[HistoryOperation]
