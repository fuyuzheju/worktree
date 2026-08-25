User:
name: string, /^[a-zA-Z0-9._-]{1,64}$/ — the identity; requests authenticate with
a bearer token that resolves to this name (Authorization: Bearer / ?token=).
"local" is a reserved client-side-only name: its data never leaves the device.

Reminder:
id: string,
name: string,
deadline: timestamp,
repeat: time | undefined,   // recurrence interval in ms; undefined = one-shot
active: boolean,            // false disables firing without deleting

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

Legacy default: ops persisted before these fields existed replay to
note: '', createdAt: 0, no deadline — fixed defaults keep replay deterministic.

sibling order: uncompleted siblings first, then completed; within each group ascending
(weight, name). weight may collide; names are unique among siblings, so the order is
deterministic across replays. Status and rename ops re-sort the node's siblings.
User weights are "small weights" (e.g. 1, 2, 3): completion status, not weight,
decides which group a node lands in.
sibling names: unique within a parent — names are the path segments clients address nodes by.

TreeOperation:
add(id, new_name, new_id, weight[, note, deadline, created_at]) | 
remove(id) | 
rename(id, new_name) | 
move(id, new_parent_id, new_weight) | 
copy(id, new_parent_id, new_id, new_weight[, new_name]) | 
complete(id) | 
uncomplete(id) | 
add_reminder(id, rmd_id, rmd_name, deadline, repeat) | 
remove_reminder(rmd_id) | 
edit_reminder(rmd_id, patch: {
  name?: string,
  deadline?: timestamp,
  repeat?: time | null,   // absent = unchanged; null = clear repeat
  active?: boolean,
}) | 
edit_node(id, patch: {
  note?: string,
  deadline?: timestamp | null,   // absent = unchanged; null = clear the deadline
})

add's note/deadline/created_at are optional: they default to '', unset and 0.
Clients set created_at = Date.now() when creating a node.
An empty edit_node or edit_reminder patch (no fields at all) is rejected.

copy is shallow: copies name, status, reminders, note and deadline, not children.
new_name defaults to the source's name. The copy's createdAt is set at apply time
(display-only — no validation depends on it, so replay divergence is harmless).

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

HistoryNode: {id: string, op: TreeOperation}   // id = op UUID, unique

HistoryOperation:
add(id, op) | 
remove(id)   // undo: delete the entry; only allowed at the head of History

History: HistoryNode[] — per user on the server (each user has their own log)
PendingQueue: Queue[HistoryOperation]
