from pathlib import Path
import logging, shutil

from app.setup import AppContext

logger = logging.getLogger(__name__)


class Storage:
    """
    A manager which processes both history storage and reminder storage.
    """

    def __init__(self, context: AppContext, STORAGE_DIR: Path):
        from .history_storage import HistoryStorage
        from .reminder_storage import ReminderStorage
        self.context = context
        db_url = f"sqlite:///{STORAGE_DIR}/worktree.db"
        self.history_storage = HistoryStorage(context, db_url)
        self.reminder_storage = ReminderStorage(context, STORAGE_DIR / "reminder")
    
    def cleanup_history(self):
        """
        clean up all the history.
        """
        shutil.rmtree(self.history_storage.history_dir)
        self.history_storage.history_dir.mkdir()
        self.history_storage.current_snapshot_dir = None
        self.history_storage.op_count_since_snapshot = 0
        self.history_storage.take_snapshot()
        logger.info("History cleaned up.")
