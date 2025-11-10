# this is the data center of the whole application
# all state in the history is pending queue and confirmed history,
# from which we can calculate everything (e.g. tree loader)
# other components possess references of Database

from __future__ import annotations
from pathlib import Path
from PyQt5.QtCore import QObject, pyqtSignal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.user import UserManager
from .models import Base
from .confirmed_history import ConfirmedHistory
from .pending_queue import PendingQueue

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
        self.user_manager.user_change.connect(self.reload_database)
        db_dir: Path = self.storage_root_path / self.user_manager.user_id()
        db_dir.mkdir(exist_ok=True)
        db_path: Path = self.storage_root_path / self.user_manager.user_id() / "storage.db"
        db_path.touch(exist_ok=True)
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
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.pending_queue = PendingQueue(self.session)
        self.confirmed_history = ConfirmedHistory(self.session)

if __name__ == '__main__':
    class UM:
        def user_id(self):
            return 'test'
    class OP:
        def stringify(self):
            return 'test operation'
    um = UM()