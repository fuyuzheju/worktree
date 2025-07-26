from PyQt5.QtCore import QObject, pyqtSignal, QTimer
from datetime import datetime
import uuid, logging

logger = logging.getLogger(__name__)

class Reminder:
    def __init__(self, 
            node_id: str, 
            due_time: datetime, 
            message: str,
            reminder_id: str = None,
            active: bool = True):
        self.node_id = node_id
        self.due_time = due_time
        self.message = message
        self.reminder_id = reminder_id or str(uuid.uuid4())
        self.active = active
    
    def edit(self, due_time: datetime = None, message: str = None, active: bool = None):
        if due_time is not None:
            self.due_time = due_time
        if message is not None:
            self.message = message
        if active is not None:
            self.active = active
    
    def to_dict(self):
        return {
            "node_id": self.node_id,
            "due_time": self.due_time.isoformat(),
            "message": self.message,
            "reminder_id": self.reminder_id,
            "active": self.active,
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(
            node_id=data["node_id"],
            due_time=datetime.fromisoformat(data["due_time"]),
            message=data["message"],
            reminder_id=data["reminder_id"],
            active=data["active"],
        )
    
    def __repr__(self):
        return f"Reminder(node_id={self.node_id}, due_time={self.due_time}, message={self.message}, reminder_id={self.reminder_id}, active={self.active})"
    
    def __str__(self):
        return self.__repr__()

    def __eq__(self, other):
        if not isinstance(other, Reminder):
            return False
        return self.node_id == other.node_id and self.due_time == other.due_time


class ReminderService(QObject):
    """
    check the reminders and send signals
    """
    reminder_due = pyqtSignal(Reminder)
    reminder_removed = pyqtSignal(Reminder)
    reminder_added = pyqtSignal(Reminder)

    def __init__(self, reminders: list[Reminder] = None, parent: QObject = None):
        super().__init__(parent)
        self.reminders = reminders or []
        self.reminder_timer = QTimer(self)
        self.reminder_timer.timeout.connect(self.check_reminders)
        self.reminder_timer.setInterval(1000)
    
    def start(self):
        self.reminder_timer.start()
        logger.info("ReminderService started")
    
    def check_reminders(self):
        now = datetime.now()
        for reminder in self.reminders:
            if reminder.due_time <= now and reminder.active:
                self.reminder_due.emit(reminder)
                logger.info(f"Reminder due: {reminder}")
                reminder.active = False
    
    def add_reminder(self, node_id: str, due_time: datetime, message: str):
        reminder = Reminder(node_id, due_time, message)
        self.reminders.append(reminder)
        self.reminder_added.emit(reminder)
        logger.debug(f"Reminder added: {reminder}")
    
    def remove_reminder(self, reminder_id: str):
        try:
            reminder = self.get_reminder(reminder_id)
            self.reminders.remove(reminder)
            self.reminder_removed.emit(reminder)
            logger.debug(f"Reminder removed: {reminder}")
        except ValueError:
            logger.error(f"Reminder not found: {reminder_id}")
    
    def get_reminder(self, reminder_id: str) -> Reminder:
        for reminder in self.reminders:
            if reminder.reminder_id == reminder_id:
                return reminder
        raise ValueError(f"Reminder not found: {reminder_id}")

