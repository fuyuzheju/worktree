```python
class Operation:
    serial_num: int
    op_type: str
    payload: dict
    hash_code: str # hash code from all the history
    next_ptr: object # pointer to build linked-list
    def serialize(self):
        pass
```

# core designs
server is the canonical data center.  
every operation is ordered by a serial number.  
serial numbers are only assigned by server, synchoronus on every terminal.  
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
    1. calculate new hash code

- when having received a force overriding request
    1. create new operations nodes for every new operation
    1. move the HEAD pointer
    > optional: call GC to cleanup unreachable nodes

### API
- HTTP GET
    - get a specific operation content with its serial number(batch supported)
    - get a specific hash code with its serial number(batch supported)

- HTTP POST
    - force override some operations

# client logic
two cases: online and offline

### storage
- a linked-list of all history operations confirmed by server, named 'confirmed_history'
> here every operation has a serial number
- a queue(maybe impletemented with linked-list) named 'pending_queue', in which all local updates unconfirmed are waiting to be sent to server
> here no serial number assigned

### running
- online(websocket connected with server)
    - always
        - if pending queue is non-empty: check conflicts with confirmed history
            - if conflict: show hint to user, inquire to discard or override
                - discard: pop the current operation
                - override: get the latest non-conflict history, from which calculate a new serial number, call server's override API with this serial number(with user confirm)
            - no conflict: send a operation request to server
        - UI render: apply both confirmed and pending operations

    - when having received an update broadcast
        1. if it's the head of pending queue, pop it from the queue
        1. store it to confirmed_history with the serial number assigned
        1. calculate new hash code

- re-connect init
    1. examine history hash codes(HTTP GET API) to get the latest identical operation
    2. override the local 'confirmed history' with the new operations gotten from server(HTTP GET API), by scarcely creating new linked-list nodes and moving the HEAD pointer. (periodically GC)
    3. build websocket connection

- both online and offline
    - when user try to do an operation
        1. check conflicts(if error, show hint to user)
        1. push to pending queue


# user management
every user possesses a whole, separated system as above
