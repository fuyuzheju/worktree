Reminder:
id: string,
name: string,
deadline: timestamp,
repeat: time | undefined,
active: boolean,

Node:
id: string,
name: string, (non-empty, must not contain '/')
weight: number,
children: Set[Node],
reminders: Reminder[],
status: boolean, (true for completed, false for uncompleted)

sibling order: ascending (weight, id). weight may collide; id breaks ties, so replay is deterministic.
sibling names: unique within a parent — names are the path segments clients address nodes by.

TreeOperation:
add(id, new_name, new_id, weight) | 
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
})

copy is shallow: copies name, status and reminders, not children. new_name defaults to the source's name.

HistoryNode: {id: string, op: TreeOperation}   // id = op UUID, unique

HistoryOperation:
add(id, op) | 
remove(id)   // undo: delete the entry; only allowed at the head of History

History: HistoryNode[]
PendingQueue: Queue[HistoryOperation]
