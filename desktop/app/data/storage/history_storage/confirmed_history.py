### requires GC
# expire cache of sql session
# delete unreachable nodes in linked list

from sqlalchemy import create_engine, Column, Integer, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker
import hashlib

from ...core import Operation
from typing import Optional


CONFIRMED_HISTORY_TABLE = "confirmed_history"
HISTORY_BRANCH_TABLE = "history_branches"


class Base(DeclarativeBase):
    pass

class ConfirmedHistoryNode(Base):
    __tablename__ = CONFIRMED_HISTORY_TABLE

    id = Column(Integer, primary_key=True)
    serial_num = Column(Integer, nullable=False)
    operation = Column(String(512), nullable=False)
    history_hash = Column(String(64), nullable=False)

    next_id = Column(Integer, ForeignKey(f"{CONFIRMED_HISTORY_TABLE}.id"), nullable=True)
    next_node = relationship("ConfirmedHistoryNode", remote_side=[id], uselist=False)

class ConfirmedHistoryBranch(Base):
    __tablename__ = HISTORY_BRANCH_TABLE

    id = Column(Integer, primary_key=True)
    name = Column(String(128), nullable=False, unique=True)

    head_id = Column(Integer, ForeignKey(f"{CONFIRMED_HISTORY_TABLE}.id"), nullable=True)
    head_node = relationship("ConfirmedHistoryNode")

class ConfirmedHistory:
    def __init__(self, db_url):
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        # check metadata length
        self.current_branch = self.session.query(ConfirmedHistoryBranch).filter_by(name="main").first()
        if self.current_branch is None:
            # create new metadata
            self.current_branch = ConfirmedHistoryBranch(head_id=None, name="main")
            self.session.add(self.current_branch)
            self.session.commit()
    
    def reload(self, db_url: Optional[str] = None):
        self.session.close()
        self.engine.dispose()
        db_url = self.engine.url if db_url is None else db_url
        self.__init__(db_url)

    def get_head_node(self):
        return self.current_branch.head_node

    def get_current_branch(self):
        return self.current_branch

    def get_by_id(self, id: int):
        return self.session.query(ConfirmedHistoryNode).filter_by(id=id).first()

    def get_branch(self, branch_name: str, pop_num: int = 0) -> list[ConfirmedHistoryNode]:
        branch = self.session.query(ConfirmedHistoryBranch).filter_by(name=branch_name).first()
        if branch is None:
            raise ValueError("branch not found")
        curr = branch.head_node
        for _ in range(pop_num):
            if curr is None:
                break
            curr = curr.next_node
        retval: list[ConfirmedHistoryNode] = []
        while curr is not None:
            retval.append(curr)
            curr = curr.next_node
        return retval

    def _insert_node_at_head(self, node: ConfirmedHistoryNode):
        node.next_node = self.current_branch.head_node
        self.current_branch.head_node = node
        self.session.add(node)

    def insert_at_head(self, operations: list[Operation], serial_nums: list[int]):
        if len(operations) != len(serial_nums):
            raise ValueError("operations and serial_nums must have the same length")
        for operation, serial_num in zip(operations, serial_nums):
            node = ConfirmedHistoryNode(operation=operation.stringify(), serial_num=serial_num)
            if self.current_branch.head_node is None:
                node.history_hash = calculate_hash("", operation)
            else:
                node.history_hash = calculate_hash(self.current_branch.head_node.history_hash, operation)
            self._insert_node_at_head(node)
        
        self.session.commit()
    
    def pop_head(self):
        if self.current_branch.head_node is None:
            return None
        head = self.current_branch.head_node
        self.current_branch.head_node = head.next_node
        self.session.commit()
        return head
    
    def branch_from(self, node_id: int, branch_name: str):
        node = self.get_by_id(node_id)
        if node is None:
            raise ValueError("node not found")
        branch = ConfirmedHistoryBranch(head_id=node_id, name=branch_name)
        self.current_branch = branch
        self.session.add(branch)
        self.session.commit()
    
    def checkout(self, branch_name: str):
        branch = self.session.query(ConfirmedHistoryBranch).filter_by(name=branch_name).first()
        if branch is None:
            raise ValueError("branch not found")
        self.current_branch = branch
        self.session.commit()
    
    def replace(self, new_branch_name: str, replaced_branch_name: Optional[str] = None):
        """
        Replace a branch with a new one.
        The replaced branch will be unreachable.
        """
        new_branch = self.session.query(ConfirmedHistoryBranch).filter_by(name=new_branch_name).first()
        if new_branch is None:
            raise ValueError("new branch not found")

        if replaced_branch_name is None:
            replaced_branch = self.current_branch
        else:
            replaced_branch = self.session.query(ConfirmedHistoryBranch).filter_by(name=replaced_branch_name).first()
        replaced_branch.head_node = new_branch.head_node
        self.session.delete(new_branch)
        self.session.commit()

def calculate_hash(prev_hash: str, operation: Operation):
    return hashlib.sha256((prev_hash + operation.stringify()).encode('utf-8')).hexdigest()
