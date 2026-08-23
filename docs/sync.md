
Users:

Every user has their own history. The identity is a username (`/^[a-zA-Z0-9._-]{1,64}$/`),
passed as the `X-User` header on every REST request and as `?user=<name>` on the
WebSocket URL. There is no authentication yet — the server trusts the header and
creates the user row lazily on first use. When auth is added, only the identity
resolution changes (token → username); the protocol stays the same.

Server logic:

History: per user, HistoryNode[] ordered by server-side append order.

two states per user: working | offline

working: all normal

offline: only that user's requests are rejected with 503 and their WebSocket
connections are closed. used while that user's database history is being rewritten.
other users are unaffected.

--

/api/submit
body: {htrop: HistoryOperation[]}
header: X-User

process ops in order, atomically:
  - id already in the user's History → skip (idempotent retry); same id with a different op → reject
  - validate each op against the user's tree as it stands after the preceding ops of the batch:
      add: parent exists, new_id unused, name valid (non-empty, no '/'), no sibling name collision
      remove/remove_reminder: no-op when the target is already gone (idempotent, concurrent removes commute)
      rename/complete/uncomplete: target exists; rename: name valid, no sibling collision (self excluded)
      move/copy: target exists, new_parent exists; move must not create a cycle;
        no sibling name collision in the new parent (copy: with its effective name)
      add_reminder: node exists
      edit_reminder: reminder exists, patch has at least one field
      edit_node: node exists, patch has at least one field
  - validation and append run under the same serialization lock, so the
    validate → append sequence is atomic across concurrent requests
  - any op invalid → 400 {conflict_id: op.id, reason}, nothing is appended

legacy ops replay deterministically: an `add` without note/deadline/created_at
yields note '', no deadline, createdAt 0 on every client and the server — the
same history always produces the same tree.

allowed: append in order, return 200, broadcast to that user's connections.

--

/api/websocket?user=<name>

build websocket connection, broadcast that user's appended ops to that user's
connections. that user's connections are closed when that user's history is rewritten.

messages (server → client):
  {type: 'op', node: HistoryNode}          a history entry was appended
  {type: 'removed', id: string}            the head entry was undone
  {type: 'history-replaced'}               the history was rewritten (clients re-catch-up)
  {type: 'state', state: working|offline}  the user's server state changed

--

/api/stats
header: X-User

get statistics for that user (op count, node count, reminder count, that user's state)

--

/api/history?id=<entry_id>       get one of the user's history entries (404 when missing)
/api/history?after=<entry_id>    {cursorFound, nodes}: the user's entries after the id (catch-up);
                             when the id is unknown — or belongs to another user — the user's
                             full history is returned with cursorFound=false (the history was rewritten)
/api/history                     {cursorFound: true, nodes}: the user's full history

--

/api/rewrite
header: X-User
body: {base: <id of the last entry the client has seen>, history: History}

force rewrite the user's history. rejected with 400 if the submitted history does not
replay cleanly, with 409 {error, head} if base is not the user's current head (the
history advanced since the client's snapshot — the client must re-merge).
otherwise: toggle that user to "offline", replace their history, then back to
"working", and answer {ok: true}.

--

Client logic:

user add ops to PendingQueue, each op gets a client UUID
render: tree = replay(History) + PendingQueue in order
confirmed History and the PendingQueue are persisted in platform storage,
namespaced per server and user; on start the client restores them and resumes
catch-up from the persisted cursor
offline: no network, render locally; offline edits survive restarts
online: every edit flushes the pending queue automatically; resync also runs on every (re)connect

the "local" user: a reserved client-side-only user that never talks to the server.
no socket, no requests; ops are appended straight into the confirmed history and
persisted locally. used for offline-only, device-local todos.

when network recovers, resync:
1. catch-up: GET /api/history?after=<last confirmed entry id>, append to local History
2. submit all pending operations
   success: clear PendingQueue, catch up again (other clients may have interleaved ops)
   conflict (400): branch at conflict_id, show two branches and let the user choose one
     - server branch: drop the pending ops, keep the server history
     - own branch: resolve each conflicted op in the UI (keep / edit / drop), then /api/rewrite
       with {base: current head, history: server history + chosen ops}
       — non-conflicting server ops are preserved; the rewritten history must replay cleanly
   503: that user is offline (maintenance or another of their clients rewriting) — keep the queue and retry, do NOT branch
