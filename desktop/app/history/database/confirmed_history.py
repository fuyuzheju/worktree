from __future__ import annotations
from PyQt5.QtCore import pyqtSignal, QObject
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.history.core import Operation
from .models import ConfirmedHistoryMetadata, ConfirmedOperationNode
import hashlib, logging

logger = logging.getLogger(__name__)

class ConfirmedHistory(QObject):
    updated = pyqtSignal()
    """
    Confirmed history stores the operations confirmed by server.
    Every confirmed operation has a serial num, which marks its order
    in the history(serial num starts from 1)
    Confirmed history must be integral and non-conflicting.
    Many parts are designed to try to synchronize the confirmed history
    with server in time.
    """
    def __init__(self, session: Session):
        super().__init__()
        self.session = session
        self.metadata = self.session.query(ConfirmedHistoryMetadata).first()
        if self.metadata is None:
            self.metadata = ConfirmedHistoryMetadata(head_id=0)
            self.session.add(self.metadata)
            self.session.commit()
    
    def get_by_id(self, node_id: int):
        query = select(ConfirmedOperationNode).\
                where(ConfirmedOperationNode.id==node_id)
        node = self.session.scalars(query).first()
        return node
    
    def get_by_serial_num(self, serial_num: int):
        query = select(ConfirmedOperationNode).\
                where(ConfirmedOperationNode.serial_num==serial_num)
        node = self.session.scalars(query).first()
        return node

    def get_head(self):
        assert self.metadata is not None
        query = select(ConfirmedOperationNode).\
                where(ConfirmedOperationNode.id==self.metadata.head_id)
        head = self.session.scalars(query).first()
        return head

    def insert_at_head(self, operation: Operation, serial_num: int):
        assert self.metadata is not None
        prev = self.get_head()
        expected_serial = 1 if prev is None else prev.serial_num+1
        if expected_serial != serial_num:
            raise ValueError("Unexpected serial num(marking a damage of data)")
        
        hashcode = calculate_hash("" if prev is None else prev.history_hash, operation)
        node = ConfirmedOperationNode(serial_num=serial_num,
                                      operation=operation.stringify(),
                                      history_hash=hashcode,)
        if prev is None:
            node.next_id = 0
        else:
            node.next_node = prev
        self.session.add(node)
        self.metadata.head_node = node
        self.session.commit()
        self.updated.emit()
        return node
    
    def overwrite(self, starting_serial_num: int, operations: list[Operation]):
        logger.debug("Overwriting confirmed history.")
        assert self.metadata is not None
        nodes: list[ConfirmedOperationNode] = []
        prev = self.get_by_serial_num(starting_serial_num-1)
        for i in range(len(operations)):
            hashcode = calculate_hash("" if prev is None else prev.history_hash, operations[i])
            node = ConfirmedOperationNode(serial_num=starting_serial_num+i,
                                          operation=operations[i].stringify(),
                                          history_hash=hashcode,)
            if prev is not None:
                node.next_node = prev
            else:
                node.next_id = 0
            nodes.append(node)
            prev = node

        self.session.add_all(nodes)
        if prev is None:
            self.metadata.head_id = 0
        else:
            self.metadata.head_node = prev
        self.session.commit()
        self.updated.emit()
        return nodes


def calculate_hash(prev_hash: str, operation: Operation):
    return hashlib.sha256((prev_hash + operation.stringify()).encode('utf-8')).hexdigest()