from __future__ import annotations
from sqlalchemy.orm import Session
from app.history.core import Operation
from models import PendingQueueMetadata, PendingOperationNode

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
        self.metadata = self.session.query(PendingQueueMetadata).first()
        if self.metadata is None:
            self.metadata = PendingQueueMetadata(
                head_id=1, tail_id=1, starting_serial_num=0
            )
            self.session.add(self.metadata)
            self.session.commit()
    
    def get_by_id(self, node_id: int):
        node = self.session.query(PendingOperationNode).filter_by(id=node_id).first()
        return node
    
    def get_head(self):
        assert self.metadata is not None
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        return self.session.query(PendingOperationNode).filter_by(id=self.metadata.head_id).first()
    
    def push(self, operation: Operation):
        assert self.metadata is not None
        node = PendingOperationNode(operation=operation.stringify())
        self.session.add(node)
        self.metadata.tail_id += 1
        self.session.commit()

    def pop(self):
        assert self.metadata is not None
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        head = self.get_head()
        self.metadata.head_id += 1
        self.session.commit()
        return head