from PyQt5.QtCore import QObject, pyqtSignal, QTimer
from pathlib import Path
from datetime import datetime
from typing import Optional
from .reminder import Reminder
# from app.utils import Notification
import logging, json

logger = logging.getLogger(__name__)

class ReminderService(QObject):
    """
    check the reminders and send signals
    """
    reminder_due = pyqtSignal(Reminder)
    edited = pyqtSignal()

    def __init__(self,
                 data_file: Path,):
        super().__init__()
        self.data_file = data_file

        self.reminders: list[Reminder] = []
        self.reminder_timer = QTimer(self)
        self.reminder_timer.timeout.connect(self.check_reminders)
        self.reminder_timer.setInterval(1000)
        self.start()
        self.load_reminders()
    
    def load_reminders(self):
        with open(self.data_file, 'r') as f:
            data = json.load(f)

        self.reminders = [Reminder.from_dict(reminder) for reminder in data]
    
    def store_reminders(self):
        with open(self.data_file, 'w') as f:
            data = [reminder.to_dict() for reminder in self.reminders]
            json.dump(data, f)
    
    def start(self):
        self.reminder_timer.start()
        logger.info("ReminderService started")
    
    def check_reminders(self):
        now = datetime.now()
        for reminder in self.reminders:
            if reminder.due_time <= now and reminder.active:
                reminder.active = False
                raise NotImplementedError() # send notification
                self.reminder_due.emit(reminder)
                logger.info(f"Reminder due: {reminder}")
    
    def add_reminder(self, node_id: str, due_time: datetime, message: str,
                     reminder_id : Optional[str] = None, active: bool = True) -> int:
        reminder = Reminder(node_id, due_time, message, reminder_id, active)
        self.reminders.append(reminder)
        self.store_reminders()
        self.edited.emit()
        logger.debug(f"Reminder added: {reminder}")
        return 0
    
    def remove_reminder(self, reminder_id: str) -> int:
        reminder = self.get_reminder_by_id(reminder_id)
        if reminder is None:
            return -1
        self.reminders.remove(reminder)
        self.store_reminders()
        self.edited.emit()
        logger.debug(f"Reminder removed: {reminder}")
        return 0
        
    def set_reminder(self, 
                    reminder_id: str,
                    due_time: Optional[datetime] = None, 
                    message: Optional[str] = None, 
                    active: Optional[bool] = None) -> int:
        reminder = self.get_reminder_by_id(reminder_id)
        if reminder is None:
            return -1
        reminder.set(due_time, message, active)
        self.store_reminders()
        self.edited.emit()
        return 0
    
    def get_reminder_by_id(self, reminder_id: str) -> Optional[Reminder]:
        for reminder in self.reminders:
            if reminder.reminder_id == reminder_id:
                return reminder
        return None
    
    def list_reminders(self) -> list[Reminder]:
        return self.reminders
    
    def get_reminders_by_node_id(self, node_id: str) -> list[Reminder]:
        ret = []
        for reminder in self.reminders:
            if reminder.node_id == node_id:
                ret.append(reminder)
        return ret

