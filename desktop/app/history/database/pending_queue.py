from __future__ import annotations
from PyQt5.QtCore import QObject, pyqtSignal
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.history.core import Operation
from .models import PendingQueueMetadata, PendingOperationNode

class PendingQueue(QObject):
    updated = pyqtSignal()
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
        super().__init__()
        self.session = session
        self.metadata = self.session.query(PendingQueueMetadata).first()
        if self.metadata is None:
            self.metadata = PendingQueueMetadata(
                head_id=1, tail_id=1, starting_serial_num=0
            )
            self.session.add(self.metadata)
            self.session.commit()
    
    def get_by_id(self, node_id: int):
        query = select(PendingOperationNode).\
                where(PendingOperationNode.id == node_id)
        node = self.session.scalars(query).first()
        return node
    
    def get_head(self):
        assert self.metadata is not None
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        query = select(PendingOperationNode).\
                where(PendingOperationNode.id == self.metadata.head_id)
        node = self.session.scalars(query).first()
        return node
    
    def get_all(self):
        assert self.metadata is not None
        query = select(PendingOperationNode).\
                where(PendingOperationNode.id.between(self.metadata.head_id, self.metadata.tail_id)).\
                order_by(PendingOperationNode.id.desc())
        nodes = self.session.scalars(query).all()
        return nodes
    
    def push(self, operation: Operation):
        assert self.metadata is not None
        node = PendingOperationNode(operation=operation.stringify())
        self.session.add(node)
        self.metadata.tail_id += 1
        self.session.commit()
        self.updated.emit()

    def pop(self):
        assert self.metadata is not None
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        head = self.get_head()
        self.metadata.head_id += 1
        self.session.commit()
        self.updated.emit()
        return head