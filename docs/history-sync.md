```python
class Operation:
    serial_num: int
    op_type: OperationType
    payload: dict
    hash_code: str # hash code from all the history
    next_ptr: object # pointer to build linked-list
    def serialize(self) -> str:
        pass
```
--- WARNING ---
the serialization implementation should be the strictly consistent between server and client,
including string encoding, json formatting, and key sorting,
in order to keep the hash code identical between terminals.


# core designs
server is the canonical data center.  
every operation is ordered by a serial number.  
serial numbers are only assigned by server, synchoronus on every terminal. serial numbers start from 1, not 0.
hash code is calculated sequently, in order to calibrate history.  
H_i = hash(H_{i-1} + Serialize(Op_i))

# server logic
connects with all clients by websocket

### storage
a linked-list of all history operations

### running
- when having received an update request
    1. try applying it directly
        > failed: return error message to client
        > success: continue
    1. apply and store operation(assign a serial number)
    1. broadcast the update(operation content, serial number)

- when having received a force overriding request: see `API` for details

# client logic
two cases: online and offline

### storage
- a linked-list of all history operations confirmed by server, named 'confirmed_history'
> here every operation has a serial number
- a queue(maybe impletemented with linked-list) named 'pending_queue', in which all local updates unconfirmed are waiting to be sent to server
> here no serial number assigned

### running
- login
    - switch to user `LAST_LOGIN`

- refresh-login
    - request to login API
    - save JWT token, user_id, username to `LAST_LOGIN`

- logout
    - request to logout API

- user input
    - store this operation to pending queue

- online(websocket connected with server)
    - always
        - if pending queue is non-empty: send a operation request to server with an expected serial num
        > the serial num is calculated by the client to mark the position of the requested operation, to avoid repetitive reception of a same operation on the server
        - wait for a while

    - when having received an update broadcast
        1. if it's the head of pending queue, pop it from the queue
        1. store it to confirmed_history with the serial number assigned
        1. reload the current tree of UI(starting from the end of confirmed history, one by one on pending queue), if conflict: show hint to user, inquire to discard or overwrite

- re-connect init
    1. examine history hash codes(HTTP GET API) to get the latest identical operation
    2. overwrite the local 'confirmed history' with the new operations gotten from server(HTTP GET API), by scarcely creating new linked-list nodes and moving the HEAD pointer. (periodically GC)
    3. build websocket connection

- both online and offline
    - when user try to do an operation
        1. push to pending queue


# user management
every user possesses a whole, separated confirmed history

when no user is logged in, it behaves like a local user is logged in, but not sending any packages to server.

# API
- Public
    - *health check*
    @REQ   GET :824/public/health/
    @RES   "Server running"
    - *register*
    @REQ   POST :824/public/register
        > payload: {"username": string,"password": string}
    @RES   {"message": string}
    - *login*
    @REQ   POST :824/public/login/
        > payload: {"username": string,"password": string}
    @RES   {"user_id": string,"access_token": string}

- Protected (JWT required)
    - *logout*
    @REQ   GET :824/logout/
    @RES   {"status": "success"|"error"}

    - *get a specific operation content with its serial number(batch supported)*
    @REQ   POST :824/history/operation
        > payload: {"serial_nums": int[]}
    @RES   operation[]

    - *get a specific hash code with its serial number(batch supported)*
    @REQ   POST :824/history/hashcode
        > payload: {"serial_nums": int[]}
    @RES   string[]

    - *force overwrite some operations*
    @REQ   POST :824/history/overwrite/
        > payload: {
            "starting_serial_num": int,
            "operations": operation[list],
        }
    @RES   {"status": "error"|"success"}

    - *websocket*
    - connect   :824/
    - c->s
        > payload: {
            "action": "update",
            "operation": operation
            "expected_serial_num": number
        }
    - s->c
        > payload: {
            "action": "update",
            "operation": operation,
            "serial_num": number,
        }
        > payload: {
            "action": "error",
            "operation": operation,
        }

## implements

*logout*
- server
    1. mark the JWT as unauthorized until it expires

*force overwrite*
- server
    1. receive the whole request
    1. parse operations
    1. create new nodes of confirmed history starting from the starting_serial_num
    - on error: response error
    - on success:
        1. move the head pointer of the confirmed history
        1. close all websocket connections
        1. response success
    > clients will try to re-connect, before which they automatically synchronize the history

- client
    1. get the last non-conflict serial num
    > this should have been ensured when we get a conflict from tree loader

    1. send this serial num and all the pending queue to this API
    1. receive response, if error: stop overriding, report error to user

*websocket connect*: JWT required

*websocket c->s*
- server
    1. receive an operation request from client
    1. check serial num in the payload
    1. try pushing it to confirmed history
    - on error: response error
    - on success: broadcast this operation by *websocket s->c*

