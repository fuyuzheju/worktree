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
    
    def set(self, due_time: datetime = None, message: str = None, active: bool = None):
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

    def __init__(self, reminders: list[Reminder] = None, parent: QObject = None):
        super().__init__(parent)
        self.reminders = reminders or []
        self.reminder_timer = QTimer(self)
        self.reminder_timer.timeout.connect(self.check_reminders)
        self.reminder_timer.setInterval(1000)
        self.start()
    
    def start(self):
        self.reminder_timer.start()
        logger.info("ReminderService started")
    
    def check_reminders(self):
        now = datetime.now()
        for reminder in self.reminders:
            if reminder.due_time <= now and reminder.active:
                reminder.active = False
                self.reminder_due.emit(reminder)
                logger.info(f"Reminder due: {reminder}")
    
    def add_reminder(self, node_id: str, due_time: datetime, message: str,
                     reminder_id : str = None, active: bool = True):
        reminder = Reminder(node_id, due_time, message, reminder_id, active)
        self.reminders.append(reminder)
        logger.debug(f"Reminder added: {reminder}")
        return 0
    
    def remove_reminder(self, reminder_id: str):
        reminder = self.get_reminder_by_id(reminder_id)
        if reminder is None:
            return -1
        self.reminders.remove(reminder)
        logger.debug(f"Reminder removed: {reminder}")
        return 0
        
    def set_reminder(self, reminder_id: str, due_time: datetime = None, message: str = None, active: bool = None):
        reminder = self.get_reminder_by_id(reminder_id)
        if reminder is None:
            return -1
        reminder.set(due_time, message, active)
        return 0
    
    def get_reminder_by_id(self, reminder_id: str) -> Reminder:
        for reminder in self.reminders:
            if reminder.reminder_id == reminder_id:
                return reminder
        return None
    
    def list_reminders(self) -> list[Reminder]:
        return self.reminders
    
    def on_tree_edit(self, edit_data):
        if edit_data['type'] == 'remove':
            node_id = edit_data['args']['node_id']
            for reminder in self.reminders:
                if reminder.node_id == node_id:
                    self.remove_reminder(reminder.reminder_id)
    
    def get_reminders_by_node_id(self, node_id: str) -> list[Reminder]:
        ret = []
        for reminder in self.reminders:
            if reminder.node_id == node_id:
                ret.append(reminder)
        return ret

