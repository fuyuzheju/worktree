from PyQt5.QtCore import QObject, pyqtSignal
from .tree import Tree, Node
from .reminder import ReminderService
import logging, inspect, functools

from typing import TypedDict, Any, Callable, Optional
from datetime import datetime
from .reminder import Reminder


class EditData(TypedDict):
    type: str
    args: dict[str, Any]


logger = logging.getLogger(__name__)


def send_signal(signal_name: str, 
                success_condition: Callable[[int], bool] = lambda res: res == 0):
    """
    a decorator that creates an api to send a signal
    """
    def dec(func: Callable):
        @functools.wraps(func)
        def wrapper(self, *args, **kwargs):
            res = func(self, *args, **kwargs)
            if success_condition(res):
                signal = getattr(self, signal_name) # possible AttributeError
                
                bound_args = inspect.signature(func).bind(self, *args, **kwargs)
                bound_args.apply_defaults()
                signal_args = dict(bound_args.arguments)
                signal_args.pop('self', None)

                edit_data: EditData = {
                    "type": func.__name__,
                    "args": signal_args,
                }

                signal.emit(edit_data)
            return res
                
        return wrapper
    return dec


class WorkTree(QObject):
    """
    This class manages all the data of the worktree.
    It possesses a Tree object and provides apis to edit it.
    """
    undo_request = pyqtSignal()
    tree_edit_signal = pyqtSignal(dict)
    reminder_edit_signal = pyqtSignal(dict)

    # tree_edit_signal: a signal to emit the edit data, which should contain the following keys:
    # - 'type': the type of the edit, which can be 'add', 'remove', 'rename', 'move'
    #     Note: set 'type' to empty if other types of edit have happened, which only wants to trigger the slots of tree edit signal but no need to be recorded
    # - 'args': a list of arguments, which depends on the type of the edit

    def __init__(self):
        super().__init__()
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
    
    def on_tree_edit(self, edit_data):
        logger.debug("Tree edited: %s", edit_data)
    
    def on_reminder_edit(self, edit_data):
        logger.debug("Reminder edited: %s", edit_data)
    
    def undo(self):
        self.undo_request.emit()
        self.tree_edit_signal.emit({
            'type': '',
            'args':{}
        })
    
    # below are the apis to operate the reminders
    def get_reminder_by_id(self, reminder_id: str) -> Optional[Reminder]:
        return self.reminder_service.get_reminder_by_id(reminder_id)

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
    def switch_to(self, node_id: str) -> int:
        return self.tree.switch_to(node_id)
    
    @send_signal('tree_edit_signal')
    def remove_node(self, node_id: str) -> int:
        return self.tree.remove_node(node_id)
    
    @send_signal('tree_edit_signal')
    def remove_subtree(self, node_id: str) -> int:
        return self.tree.remove_subtree(node_id)
    
    @send_signal('tree_edit_signal')
    def move_node(self, node_id: str, new_parent_id: str) -> int:
        return self.tree.move_node(node_id, new_parent_id)
    
    # below are the apis to operate the reminders
    # def init_reminder_apis(self):
    #     api_names = [
    #         'add_reminder',
    #         'remove_reminder',
    #         'set_reminder',
    #     ]

    #     success_conditions = {
    #     }
    #     default_success_condition = lambda res: res == 0

    #     for name in api_names:
    #         success_cond = success_conditions.get(name, default_success_condition)
    #         original_func = getattr(self.reminder_service, name)

    #         def create_api(func, s_cond, api_type):
    #             def api_method(self, *args, **kwargs):
    #                 bound_args = inspect.signature(func).bind(*args, **kwargs)
    #                 bound_args.apply_defaults()
    #                 signal_args = dict(bound_args.arguments)

    #                 res = func(*args, **kwargs)

    #                 if s_cond(res):
    #                     self.reminder_edit_signal.emit({
    #                         'type': api_type,
    #                         'args': signal_args
    #                     })
    #                 return res
    #             return api_method

    #         api_method = create_api(original_func, success_cond, name)
    #         setattr(self, name, api_method.__get__(self))

    # # below are the apis to edit the tree
    # def init_tree_apis(self):
    #     api_names = [
    #         'add_node',
    #         'reopen_node',
    #         'complete_node',
    #         'switch_to',
    #         'remove_node',
    #         'remove_subtree',
    #         'move_node',
    #     ]

    #     success_conditions = {
    #     }
    #     default_success_condition = lambda res: res == 0

    #     for name in api_names:
    #         success_cond = success_conditions.get(name, default_success_condition)
    #         original_func = getattr(self.tree, name)

    #         def create_api(func, s_cond, api_type):
    #             def api_method(self, *args, **kwargs):
    #                 bound_args = inspect.signature(func).bind(*args, **kwargs)
    #                 bound_args.apply_defaults()
    #                 signal_args = dict(bound_args.arguments)

    #                 res = func(*args, **kwargs)

    #                 if s_cond(res):
    #                     self.tree_edit_signal.emit({
    #                         'type': api_type,
    #                         'args': signal_args
    #                     })
    #                 return res
    #             return api_method

    #         api_method = create_api(original_func, success_cond, name)
    #         setattr(self, name, api_method.__get__(self))
