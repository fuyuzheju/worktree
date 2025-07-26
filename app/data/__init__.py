from PyQt5.QtCore import QObject, pyqtSignal
from .tree import Tree
from .reminder import ReminderService
import logging, inspect

logger = logging.getLogger(__name__)

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
        self.init_tree_apis()
    
    def on_tree_edit(self, edit_data):
        logger.debug("Tree edited: %s", edit_data)
    
    def on_reminder_edit(self, edit_data):
        logger.debug("Reminder edited: %s", edit_data)
    
    # below are the apis to operate the reminders
    def init_reminder_apis(self):
        api_names = [
            'add_reminder',
            'remove_reminder',
            'edit_reminder',
        ]

        success_conditions = {
        }
        default_success_condition = lambda res: res == 0

        for name in api_names:
            success_cond = success_conditions.get(name, default_success_condition)
            original_func = getattr(self.tree, name)

            def create_api(func, s_cond, api_type):
                def api_method(self, *args, **kwargs):
                    bound_args = inspect.signature(func).bind(*args, **kwargs)
                    bound_args.apply_defaults()
                    signal_args = dict(bound_args.arguments)

                    res = func(*args, **kwargs)

                    if s_cond(res):
                        self.reminder_edit_signal.emit({
                            'type': api_type,
                            'args': signal_args
                        })
                    return res
                return api_method

            api_method = create_api(original_func, success_cond, name)
            setattr(self, name, api_method.__get__(self))

    # below are the apis to edit the tree
    def init_tree_apis(self):
        api_names = [
            'add_node',
            'reopen_node',
            'complete_node',
            'complete_current',
            'switch_to',
            'remove_node',
            'remove_subtree',
            'move_node',
        ]

        success_conditions = {
        }
        default_success_condition = lambda res: res == 0

        for name in api_names:
            success_cond = success_conditions.get(name, default_success_condition)
            original_func = getattr(self.tree, name)

            def create_api(func, s_cond, api_type):
                def api_method(self, *args, **kwargs):
                    bound_args = inspect.signature(func).bind(*args, **kwargs)
                    bound_args.apply_defaults()
                    signal_args = dict(bound_args.arguments)

                    res = func(*args, **kwargs)

                    if s_cond(res):
                        self.tree_edit_signal.emit({
                            'type': api_type,
                            'args': signal_args
                        })
                    return res
                return api_method

            api_method = create_api(original_func, success_cond, name)
            setattr(self, name, api_method.__get__(self))
    
    def undo(self):
        self.undo_request.emit()
        self.tree_edit_signal.emit({
            'type': '',
            'args':{}
        })
