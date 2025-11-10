from __future__ import annotations
from sqlalchemy.orm import Session
from app.history.core import Operation
from .models import ConfirmedHistoryMetadata, ConfirmedOperationNode
import hashlib

class ConfirmedHistory:
    """
    Confirmed history stores the operations confirmed by server.
    Every confirmed operation has a serial num, which marks its order
    in the history(serial num starts from 1)
    Confirmed history must be integral and non-conflicting.
    Many parts are designed to try to synchronize the confirmed history
    with server in time.
    """
    def __init__(self, session: Session):
        self.session = session
        self.metadata = self.session.query(ConfirmedHistoryMetadata).first()
        if self.metadata is None:
            self.metadata = ConfirmedHistoryMetadata(head_id=0)
            self.session.add(self.metadata)
            self.session.commit()
    
    def get_by_id(self, node_id: int):
        node = self.session.query(ConfirmedOperationNode).filter_by(id=node_id).first()
        return node

    def get_head(self):
        assert self.metadata is not None
        head = self.session.query(ConfirmedOperationNode).filter_by(id=self.metadata.head_id).first()
        return head

    def insert_at_head(self, operation: Operation, serial_num: int):
        prev = self.get_head()
        expected_serial = 1 if prev is None else prev.serial_num+1
        if expected_serial != serial_num:
            raise ValueError("Unexpected serial num(marking a damage of data)")
        
        hashcode = calculate_hash("" if prev is None else prev.history_hash, operation)
        node = ConfirmedOperationNode(serial_num=serial_num,
                                      operation=operation.stringify(),
                                      history_hash=hashcode,
                                      next_id=1 if prev is None else prev.id)
        
        return node
    
    def overwrite(self, starting_serial_num: int, operations: list[Operation]):
        raise NotImplementedError()


def calculate_hash(prev_hash: str, operation: Operation):
    return hashlib.sha256((prev_hash + operation.stringify()).encode('utf-8')).hexdigest()