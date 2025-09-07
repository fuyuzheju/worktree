from pathlib import Path
import logging, shutil

from app.setup import AppContext

logger = logging.getLogger(__name__)


class Storage:
    """
    A manager which processes both history storage and reminder storage.
    """

    def __init__(self, context: AppContext, storage_dir: Path):
        from .history_storage import HistoryStorage
        from .reminder_storage import ReminderStorage
        self.context = context
        storage_dir.mkdir(parents=True, exist_ok=True)
        db_url = f"sqlite:///{storage_dir}/storage.db"
        self.history_storage = HistoryStorage(context, db_url)
        self.reminder_storage = ReminderStorage(context, storage_dir / "reminder")
    
    def reload(self, storage_dir: Path):
        storage_dir.mkdir(parents=True, exist_ok=True)
        db_url = f"sqlite:///{storage_dir}/storage.db"
        self.history_storage.reload(db_url)
        self.reminder_storage.reload(storage_dir / "reminder")
    
    # def cleanup_history(self):
    #     """
    #     clean up all the history.
    #     """
    #     shutil.rmtree(self.history_storage.history_dir)
    #     self.history_storage.history_dir.mkdir()
    #     self.history_storage.current_snapshot_dir = None
    #     self.history_storage.op_count_since_snapshot = 0
    #     self.history_storage.take_snapshot()
    #     logger.info("History cleaned up.")
