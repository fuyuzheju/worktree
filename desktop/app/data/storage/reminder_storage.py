import json, logging

from pathlib import Path
from ..core.reminder import Reminder
from app.setup import AppContext

logger = logging.getLogger(__name__)

class ReminderStorage:
    """
    A manager which processes the reminder storage.
    """
    def __init__(self, context: AppContext, reminder_dir: Path):
        self.context = context
        self.reminder_dir = reminder_dir
        self.reminder_dir.mkdir(parents=True, exist_ok=True)
        reminder_file = self.reminder_dir / 'reminders.json'

        if reminder_file.exists():
            logger.debug("Loading reminders from disk.")
            self.load_from_disk()
        else:
            logger.debug("No reminders found. Nothing to load.")

        self.context.work_tree.reminder_edit_signal.connect(self.handle_edit)
    
    def handle_edit(self, operation: dict):
        self.save_reminders()

    def save_reminders(self):
        logger.debug("Saving reminders.")
        data = []
        for reminder in self.context.work_tree.list_reminders():
            data.append(reminder.to_dict())

        with open(self.reminder_dir / 'reminders.json', 'w') as f:
            json.dump(data, f)
    
    def load_from_disk(self):
        with open(self.reminder_dir / 'reminders.json', 'r') as f:
            data = json.load(f)
        
        self.context.work_tree.reminder_service.reminders = []
        for reminder_data in data:
            reminder = Reminder.from_dict(reminder_data)
            self.context.work_tree.reminder_service.reminders.append(reminder)