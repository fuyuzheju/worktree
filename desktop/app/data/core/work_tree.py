from PyQt5.QtCore import QObject, pyqtSignal
import logging, inspect, functools, time

from typing import Callable, Optional
from datetime import datetime
from .tree import Node
from .reminder import Reminder
from . import EditData, ExtOperation


logger = logging.getLogger(__name__)


def send_signal(signal_name: str, 
                success_condition: Callable[[int], bool] = lambda res: res == 0):
    """
    a decorator
    send a signal accordingly when a tree operation succeeded
    """
    def dec(func: Callable):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            res = func(self, *args, **kwargs)
            if success_condition(res):
                signal = getattr(self, signal_name) # possible AttributeError
                
                bound_args = inspect.signature(func).bind(self, *args, **kwargs)
                bound_args.apply_defaults()
                signal_payload = dict(bound_args.arguments)
                signal_payload.pop('self', None)

                ext_operation = ExtOperation.from_dict({
                    "op_type": func.__name__,
                    "payload": signal_payload,
                    "timestamp": int(time.time()),
                })
                signal.emit(ext_operation)
            return res
                
        return wrapper
    return dec


class WorkTree(QObject):
    """
    This class manages all the data of the worktree.
    It possesses a Tree object and provides apis to edit it.
    """
    tree_edit_signal = pyqtSignal(ExtOperation)
    reminder_edit_signal = pyqtSignal(dict)

    # tree_edit_signal: a signal to emit the edit data, which should contain the following keys:
    # - 'type': the type of the edit, which can be 'add', 'remove', 'rename', 'move'
    #     Note: set 'type' to empty if other types of edit have happened, which only wants to trigger the slots of tree edit signal but no need to be recorded
    # - 'args': a list of arguments, which depends on the type of the edit

    def __init__(self):
        super().__init__()
        from .tree import Tree
        from .reminder import ReminderService
        self.tree = Tree()
        self.reminder_service = ReminderService()
        self.tree_edit_signal.connect(self.on_tree_edit)
        self.tree_edit_signal.connect(self.reminder_service.on_tree_edit)
        empty_data: EditData = {
            'type': '',
            'args': {}
        }
        self.reminder_service.reminder_due.connect(lambda: self.reminder_edit_signal.emit(empty_data))
        # self.init_tree_apis()
        # self.init_reminder_apis()
    
    def on_tree_edit(self, ext_operation: ExtOperation):
        logger.debug("Tree edited: %s", ext_operation.stringify())
    
    def on_reminder_edit(self, edit_data):
        logger.debug("Reminder edited: %s", edit_data)
    
    # below are the apis to operate the reminders
    def get_reminder_by_id(self, reminder_id: str) -> Optional[Reminder]:
        return self.reminder_service.get_reminder_by_id(reminder_id)

    def list_reminders(self) -> list[Reminder]:
        return self.reminder_service.list_reminders()

    @send_signal('reminder_edit_signal')
    def add_reminder(self, node_id: str, due_time: datetime, message: str,
                     reminder_id : Optional[str] = None, active: bool = True) -> int:
        return self.reminder_service.add_reminder(node_id, due_time, message, reminder_id, active)
    
    @send_signal('reminder_edit_signal')
    def remove_reminder(self, reminder_id: str) -> int:
        return self.reminder_service.remove_reminder(reminder_id)
    
    @send_signal('reminder_edit_signal')
    def set_reminder(self, reminder_id: str,
                     due_time: Optional[datetime] = None,
                     message: Optional[str] = None,
                     active: Optional[bool] = None) -> int:
        return self.reminder_service.set_reminder(reminder_id, due_time, message, active)


    # below are the apis to operate the tree
    def get_node_by_id(self, identity: str) -> Optional[Node]:
        return self.tree.get_node_by_id(identity)

    @send_signal('tree_edit_signal')
    def add_node(self, parent_node_id: str, new_node_name: str, new_node_id: Optional[str] = None) -> int:
        return self.tree.add_node(parent_node_id, new_node_name, new_node_id)

    @send_signal('tree_edit_signal')
    def reopen_node(self, node_id: str) -> int:
        return self.tree.reopen_node(node_id)
    
    @send_signal('tree_edit_signal')
    def complete_node(self, node_id: str) -> int:
        return self.tree.complete_node(node_id)
    
    @send_signal('tree_edit_signal')
    def remove_node(self, node_id: str) -> int:
        return self.tree.remove_node(node_id)
    
    @send_signal('tree_edit_signal')
    def remove_subtree(self, node_id: str) -> int:
        return self.tree.remove_subtree(node_id)
    
    @send_signal('tree_edit_signal')
    def move_node(self, node_id: str, new_parent_id: str) -> int:
        return self.tree.move_node(node_id, new_parent_id)
