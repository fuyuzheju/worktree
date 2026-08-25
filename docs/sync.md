
Users:

Every user has their own history. The identity is a username (`/^[a-zA-Z0-9._-]{1,64}$/`),
created via `POST /api/register` (open registration — no lazily-created users).
REST requests authenticate with `Authorization: Bearer <token>`; the WebSocket
URL carries `?token=<token>` (browsers cannot set WS headers). A token resolves
to its username; the username is never trusted from the client.

Tokens are per device: every register/login issues a new token with an optional
device label. The server stores only the SHA-256 hash of each token (the raw
token is returned exactly once). Tokens can be listed and revoked individually;
revoking a token does not close its already-open WebSocket — the next REST
request 401s and the client stops.

401 semantics: 401 means the credentials are missing, invalid or revoked. It is
neither a conflict (400) nor offline (503): the client marks itself
"auth failed", stops reconnecting, and the UI prompts for a new login.

Authentication endpoints:

/api/register
body: {username, password, inviteCode?}
- creates the user (password hashed with scrypt, stored self-describing:
  scrypt$N=16384,r=8,p=1$<salt>$<key>) and issues a token
- 201 {username, token, tokenId}; 400 invalid username/password
  (password: 8-1024 chars); 409 {error: 'username taken'}
- inviteCode is reserved for a future invite-only registration mode
  (REGISTRATION_MODE=invite); it is validated for shape but ignored while
  registration is open

/api/login
body: {username, password, label?}   (label = device name, ≤100 chars)
- 200 {username, token, tokenId}; 401 {error: 'invalid username or password'}
  for a wrong password and an unknown user alike (no username enumeration;
  unknown users burn the same scrypt time)

/api/logout         (authed)  revokes the presented token → {ok: true}
/api/tokens         (authed)  GET: {tokens: [{id, label, createdAt, lastUsedAt, current}]}
                              DELETE /api/tokens/:id: revokes one device token;
                              404 when the id is unknown or belongs to another user

Server logic:

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
header: Authorization: Bearer <token>

process ops in order, atomically:
  - id already in the user's History → skip (idempotent retry); same id with a different op → reject
  - validate each op against the user's tree as it stands after the preceding ops
    of the batch, history removes included (an add cannot depend on an entry its
    own batch undoes):
      history remove: no-op when the target entry is already gone (idempotent retry;
        concurrent undos of the same head commute); when it still exists it must be
        the user's current head (only the head may be undone)
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

/api/websocket?token=<token>

build websocket connection (the token is resolved to the user during the upgrade;
an unknown/revoked token is answered with a raw HTTP 401 at upgrade time, which
browsers see as an abnormal close — the authoritative signal is the next REST
401). broadcast that user's appended ops to that user's connections. that
user's connections are closed when that user's history is rewritten.

messages (server → client):
  {type: 'op', node: HistoryNode}          a history entry was appended
  {type: 'removed', id: string}            the head entry was undone
  {type: 'history-replaced'}               the history was rewritten (clients re-catch-up)
  {type: 'state', state: working|offline}  the user's server state changed

--

/api/stats
header: Authorization: Bearer <token>

get statistics for that user (op count, node count, reminder count, that user's state)

--

/api/history?id=<entry_id>       get one of the user's history entries (404 when missing)
/api/history?after=<entry_id>    {cursorFound, nodes}: the user's entries after the id (catch-up);
                             when the id is unknown — or belongs to another user — the user's
                             full history is returned with cursorFound=false (the history was rewritten)
/api/history                     {cursorFound: true, nodes}: the user's full history
header: Authorization: Bearer <token>

--

/api/rewrite
header: Authorization: Bearer <token>
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
   conflict (400): branch at the pre-catch-up head (the "last agreed entry"), show the two
     branches and let the user choose one
     - rejected undos never surface a conflict: a queue of only removes is dropped
       (the server only undoes its head, so a rejected undo can never apply)
     - server branch: drop the pending ops, keep the server history
     - own branch: keep the local version — /api/rewrite with
       {base: current server head, history: agreed base + pending ops}; the server's
       branch is discarded, pending ops that do not replay on the base are dropped,
       and a pending undo drops the base's tail entry
     - when the catch-up found the base gone (history rewritten), the server branch
       is the whole server history
     - the rewritten history must replay cleanly (400 otherwise); a 409 retries the
       rewrite against the same agreed base
   503: that user is offline (maintenance or another of their clients rewriting) — keep the queue and retry, do NOT branch
   401: the token is invalid or revoked — stop syncing and reconnecting, mark the
       client "auth failed" and prompt for a new login (the pending queue is kept)

undo:

the client exposes undo() as the only operation on the history log itself:
  - the PendingQueue has add entries: drop the newest pending add locally —
    no server roundtrip
  - otherwise: enqueue remove {id: <target id>} and submit; the target is the
    newest confirmed entry that no pending remove covers yet, so undo can be
    repeated offline (the queued removes run in order on the server)
  - the server deletes the head entry only (a stale undo is a 400 conflict)
  - a pending remove is never dropped by undo (removes themselves cannot be undone)
  - pending undos render optimistically: each pending remove drops its target
    confirmed entry when building the local tree, so undo works offline
  - local user: undo removes the confirmed head directly, no queue
