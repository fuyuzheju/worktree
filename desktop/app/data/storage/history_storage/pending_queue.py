### requires GC

from sqlalchemy import create_engine, Column, Integer, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from ...core import ExtOperation


PENDING_OPERATION_TABLE = "pending_operations"
QUEUE_METADATA_TABLE = "queue_metadata"

class Base(DeclarativeBase):
    pass

class PendingOperationNode(Base):
    __tablename__ = PENDING_OPERATION_TABLE

    id = Column(Integer, primary_key=True, nullable=False)
    operation = Column(String(512), nullable=False)


class PendingQueueMetadata(Base):
    __tablename__ = QUEUE_METADATA_TABLE
    id = Column(Integer, primary_key=True, nullable=False)

    head_id = Column(Integer, ForeignKey(f"{PENDING_OPERATION_TABLE}.id"), nullable=False)
    # head = relationship("PendingOperationNode", foreign_keys=[head_id], uselist=False)
    tail_id = Column(Integer, ForeignKey(f"{PENDING_OPERATION_TABLE}.id"), nullable=False)
    # tail = relationship("PendingOperationNode", foreign_keys=[tail_id], uselist=False)


class PendingQueue:
    def __init__(self, db_url):
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.metadata = self.session.query(PendingQueueMetadata).first()
        if self.metadata is None:
            self.metadata = PendingQueueMetadata(head_id=1, tail_id=1)
            self.session.add(self.metadata)
            self.session.commit()
    
    def get_metadata(self):
        return self.metadata
    
    def is_empty(self):
        return self.metadata.head_id == self.metadata.tail_id

    def get_head_node(self):
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        return self.session.query(PendingOperationNode).filter_by(id=self.metadata.head_id).first()
    
    def get_tail_node(self):
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        return self.session.query(PendingOperationNode).filter_by(id=self.metadata.tail_id-1).first()

    def get_by_id(self, id: int):
        return self.session.query(PendingOperationNode).filter_by(id=id).first()

    def _pop_front(self):
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        head = self.get_head_node()
        self.metadata.head_id += 1
        return head

    def _pop_back(self):
        if self.metadata.head_id == self.metadata.tail_id:
            return None
        tail = self.get_tail_node()
        self.metadata.tail_id -= 1
        self.session.delete(tail)
        # due to the default behavior of SQL, 
        # the id is kept continous automatically
        # we only need to delete the last element
        # and the id continuity will be kept automatically
        return tail

    def push(self, operations: list[ExtOperation] | ExtOperation):
        if isinstance(operations, ExtOperation):
            operations = [operations]
        for op in operations:
            node = PendingOperationNode(operation=op.stringify())
            self.session.add(node)
        self.metadata.tail_id += len(operations) # the id auto-increases with SQL
        self.session.commit()

    def pop_front(self, num: int = 1):
        retval: list[PendingOperationNode] = []
        for _ in range(num):
            retval.append(self._pop_front())
        self.session.commit()
        return retval
    
    def pop_back(self, num: int = 1):
        retval: list[PendingOperationNode] = []
        for _ in range(num):
            retval.append(self._pop_back())
        self.session.commit()
        return retval

