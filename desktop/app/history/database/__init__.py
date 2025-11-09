# this is the data center of the whole application
# all state in the history is pending queue and confirmed history,
# from which we can calculate everything (e.g. tree loader)
# other components possess references of Database

from pathlib import Path
from PyQt5.QtCore import QObject, pyqtSignal
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey
from sqlalchemy.orm import sessionmaker, DeclarativeBase, relationship
from app.user import UserManager
from app.history.database.confirmed_history import ConfirmedHistory
from app.history.database.pending_queue import PendingQueue

CONFIRMED_HISTORY_TABLE = "confirmed_history"
HISTORY_BRANCH_TABLE = "history_branches"
PENDING_OPERATION_TABLE = "pending_operations"
QUEUE_METADATA_TABLE = "queue_metadata"

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
    starting_serial_num = Column(Integer, ForeignKey(f"{CONFIRMED_HISTORY_TABLE}.serial_num"), nullable=False)


class Database(QObject):
    updated = pyqtSignal()
    """
    Database possesses pending queue and confirmed history,
    and meanwhile provides a SQL session for them.
    Pending queue and confirmed history do not care which SQL 
    connection they are interacting with, and they only use the session
    provided by Database.
    Database changes the SQLite file when the user is changed,
    and afterwards recreates pending queue and confirmed history,
    to let them interacts with the new SQL connection.
    """
    def __init__(self,
                 user_manager: UserManager,
                 storage_root_path: Path,):
        '''
        @param storage_root_path: the root directory of data storage,
            in which a separated directory is created for each user,
            in order to isolate every user's data
        '''
        super().__init__()

        self.user_manager = user_manager
        self.storage_root_path = storage_root_path
        self.user_manager.user_change.connect(self.onUserChange)
        db_path = self.storage_root_path / self.user_manager.user_id() / "storage.db"
        db_url = f"sqlite:///" + str(db_path)
        
        self.engine = create_engine(db_url)
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()

        self.pending_queue = PendingQueue(self.session)
        self.confirmed_history = ConfirmedHistory(self.session)

    def reload_database(self):
        self.engine.dispose()
        
        db_path = self.storage_root_path / self.user_manager.user_id() / "storage.db"
        db_url = f"sqlite:///" + str(db_path)
        self.engine = create_engine(db_url)
        self.session = sessionmaker(bind=self.engine)()
        self.pending_queue = PendingQueue(self.session)
        self.confirmed_history = ConfirmedHistory(self.session)
    
    def onUserChange(self):
        self.reload_database()