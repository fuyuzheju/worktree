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
        from .sync.history_sync import HistorySync
        self.context = context
        storage_dir.mkdir(parents=True, exist_ok=True)
        db_url = f"sqlite:///{storage_dir}/storage.db"
        self.history_storage = HistoryStorage(context, db_url)
        self.reminder_storage = ReminderStorage(context, storage_dir / "reminder")
        self.history_sync = HistorySync(self.context, self.history_storage)
    
    def reload(self, storage_dir: Path):
        storage_dir.mkdir(parents=True, exist_ok=True)
        db_url = f"sqlite:///{storage_dir}/storage.db"
        self.history_storage.reload(db_url)
        self.reminder_storage.reload(storage_dir / "reminder")
