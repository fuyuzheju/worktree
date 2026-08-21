
Server logic:

History: HistoryNode[], ordered by server-side append order.

two states: working | offline

working: all normal

offline: cuts all connections and rejects all requests with 503. used while the database is being updated.

--

/submit
body: HistoryOperation[]

process ops in order, atomically:
  - id already in History → skip (idempotent retry); same id with a different op → reject
  - validate each op against the tree as it stands after the preceding ops of the batch:
      add: parent exists, new_id unused, name valid (non-empty, no '/'), no sibling name collision
      remove/remove_reminder: no-op when the target is already gone (idempotent, concurrent removes commute)
      rename/complete/uncomplete: target exists; rename: name valid, no sibling collision (self excluded)
      move/copy: target exists, new_parent exists; move must not create a cycle;
        no sibling name collision in the new parent (copy: with its effective name)
      add_reminder: node exists
      edit_reminder: reminder exists, patch has at least one field
  - validation and append run under the same serialization lock, so the
    validate → append sequence is atomic across concurrent requests
  - any op invalid → 400 {conflict_id: op.id, reason}, nothing is appended

allowed: append in order, return 200, broadcast.

--

/websocket

build websocket connection, broadcast appended ops. connections are closed on /rewrite.

--

/stats

get statistics

--

/history?id=<entry_id>       get one history entry (404 when missing)
/history?after=<entry_id>    {cursorFound, nodes}: entries after the id (catch-up); when the id is unknown the full history is returned with cursorFound=false (the history was rewritten)
/history                     {cursorFound: true, nodes}: the full history

--

/rewrite
body: {base: <id of the last entry the client has seen>, history: History}

force rewrite history. rejected with 409 if base is not the current head (the history advanced since the client's snapshot — the client must re-merge).
otherwise: toggle to "offline" state, replace the history, then back to "working".

--

Client logic:

user add ops to PendingQueue, each op gets a client UUID
render: tree = replay(History) + PendingQueue in order
confirmed History and the PendingQueue are persisted in platform storage,
namespaced per server and user; on start the client restores them and resumes
catch-up from the persisted cursor
offline: no network, render locally; offline edits survive restarts
online: every edit flushes the pending queue automatically; resync also runs on every (re)connect

when network recovers, resync:
1. catch-up: GET /history?after=<last confirmed entry id>, append to local History
2. submit all pending operations
   success: clear PendingQueue, catch up again (other clients may have interleaved ops)
   conflict (400): branch at conflict_id, show two branches and let the user choose one
     - server branch: drop the pending ops, keep the server history
     - own branch: resolve each conflicted op in the UI (keep / edit / drop), then /rewrite
       with {base: current head, history: server history + chosen ops}
       — non-conflicting server ops are preserved; the rewritten history must replay cleanly
   503: server offline (maintenance or another client rewriting) — keep the queue and retry, do NOT branch
