from PyQt5.QtCore import QObject, pyqtSignal, QTimer
from pathlib import Path
from datetime import datetime
from typing import Optional
from .reminder import Reminder
from app.user import UserManager
from app.history.core import Operation, OperationType
from app.utils import Notification
from app.globals import context, ENV
from app.shell.commands.utils import time_parser
import logging, json, time


DELAY_ACTION_ID = "delay"
COMPLETE_ACTION_ID = "complete"

class ReminderService(QObject):
    """
    check the reminders and send signals
    """
    reminder_due = pyqtSignal(Reminder)
    edited = pyqtSignal()

    def __init__(self,
                 user_manager: UserManager,
                 storage_root_path: Path,
                 filename: str,):
        super().__init__()
        self.user_manager = user_manager
        self.storage_root_path = storage_root_path
        self.filename = filename

        dir_path = self.storage_root_path / self.user_manager.user_id()
        dir_path.mkdir(exist_ok=True)
        self.data_file = self.storage_root_path / self.user_manager.user_id() / self.filename
        self.data_file.touch(exist_ok=True)

        self.logger = logging.getLogger(__name__)

        self.reminders: list[Reminder] = []
        self.reminder_timer = QTimer(self)
        self.reminder_timer.timeout.connect(self.check_reminders)
        self.reminder_timer.setInterval(1000)
        self.start()
        self.load_reminders()
        self.edited.connect(self.store_reminders)
        self.user_manager.user_change.connect(self.reload)

        if ENV and context.settings_manager.get("reminderNotifications"):
            self.notifier = Notification(self.notification_callback)
            self.notifier.request_authorization_if_needed()
            self.notifier.add_category("reminder", [
                {"id": DELAY_ACTION_ID, "title": "delay", "type": "text"},
                {"id": COMPLETE_ACTION_ID, "title": "complete", "type": ""},
            ])
            self.logger.info("Notification initialized")
        else:
            self.notifier = None
    
    def reload(self):
        dir_path = self.storage_root_path / self.user_manager.user_id()
        dir_path.mkdir(exist_ok=True)
        self.data_file = self.storage_root_path / self.user_manager.user_id() / self.filename
        self.data_file.touch(exist_ok=True)
        self.load_reminders()
    
    def load_reminders(self):
        try:
            with open(self.data_file, 'r') as f:
                data = json.load(f)
            self.reminders = [Reminder.from_dict(reminder) for reminder in data]
        except (json.JSONDecodeError, TypeError):
            self.reminders = []
            self.store_reminders()
    
    def store_reminders(self):
        self.logger.debug(f"Storing reminders.")
        with open(self.data_file, 'w') as f:
            data = [reminder.to_dict() for reminder in self.reminders]
            json.dump(data, f)
    
    def start(self):
        self.reminder_timer.start()
        self.logger.info("Reminder service started")
    
    def check_reminders(self):
        now = datetime.now()
        for reminder in self.reminders:
            if reminder.due_time <= now and reminder.active:
                reminder.active = False
                self.reminder_due.emit(reminder)
                self.edited.emit() # connected to rerendering
                self.logger.info(f"Reminder due: {reminder}")
                self.notify(reminder)
    
    def add_reminder(self, node_id: str, due_time: datetime, message: str,
                     reminder_id : Optional[str] = None, active: bool = True) -> int:
        reminder = Reminder(node_id, due_time, message, reminder_id, active)
        self.reminders.append(reminder)
        self.edited.emit()
        self.logger.info(f"Reminder added: {reminder}")
        return 0
    
    def remove_reminder(self, reminder_id: str) -> int:
        reminder = self.get_reminder_by_id(reminder_id)
        if reminder is None:
            return -1
        self.reminders.remove(reminder)
        self.edited.emit()
        self.logger.info(f"Reminder removed: {reminder}")
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
        self.edited.emit()
        self.logger.info(f"Reminder set: {reminder}")
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
    
    def notify(self, reminder):
        """
        called when a reminder due
        """
        if self.notifier is None:
            return
        self.notifier.send_notification(
            "Reminder Due",
            reminder.message,
            identifier=f"com.fuyuzheju.worktree.reminder.{reminder.reminder_id}",
            category_id="reminder",
            user_info={"reminder_id": reminder.reminder_id}
        )
    
    def notification_callback(self,
                              action_id: str,
                              user_info: dict,
                              user_text: str,):
        """
        called when the user responsed to the notification
        """
        if action_id == DELAY_ACTION_ID:
            reminder = self.get_reminder_by_id(user_info["reminder_id"])
            assert reminder is not None
            try:
                due_time = time_parser(user_text)
            except:
                pass
            else:
                self.set_reminder(reminder_id=reminder.reminder_id,
                                  due_time=due_time,
                                  active=True)
                self.logger.info(f"Reminder Delayed to time: {due_time}(with format '{user_text}')")
        
        elif action_id == COMPLETE_ACTION_ID:
            reminder = self.get_reminder_by_id(user_info["reminder_id"])
            assert reminder is not None

            op = Operation(op_type=OperationType.COMPLETE_NODE,
                           payload={
                               "node_id": reminder.node_id,
                           }, timestamp=int(time.time()))

            if context.current_app.loader.check(op): # type: ignore
                context.current_app.database.pending_queue.push(op) # type: ignore
        
        else:
            context.current_app.main_window.to_frontground() # type: ignore
        

