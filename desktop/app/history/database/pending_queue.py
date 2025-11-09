from sqlalchemy.orm import Session
from app.history.core import Operation

class PendingQueue:
    """
    Pending queue stores operations which the user did but is not
    confirmed by server yet.
    Pending operations will be orderly sent to server to get confirmed.
    The head operations is popped after sent.
    Pending queue also stores a pointer, pointing at the starting node
    after which the pending operations are added.
    This pointer helps us to recover the history when overwriting the
    confirmed history.
    """
    def __init__(self, session: Session):
        self.session = session
    
    def getById(self, node_id: int):
        pass
    
    def getHead(self):
        pass
    
    def push(self, operation: Operation):
        pass

    def pop(self, operation: Operation):
        pass