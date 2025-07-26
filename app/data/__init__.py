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
    edit_signal = pyqtSignal(dict)

    # edit_signal: a signal to emit the edit data, which should contain the following keys:
    # - 'type': the type of the edit, which can be 'add', 'remove', 'rename', 'move'
    #     Note: set 'type' to empty if other types of edit have happened, which only wants to trigger the slots of tree edit signal but no need to be recorded
    # - 'args': a list of arguments, which depends on the type of the edit

    def __init__(self):
        super().__init__()
        self.tree = Tree()
        self.reminder_service = ReminderService()
        self.edit_signal.connect(self.on_edit)
        self.init_tree_apis()
    
    def on_edit(self, edit_data):
        logger.debug("Tree edited: %s", edit_data)
    
    # below are the apis to operate the reminders
    def add_reminder(self, node_id, due_time, message):
        res = self.reminder_service.add_reminder(node_id, due_time, message)
        return res
    
    def remove_reminder(self, reminder_id):
        res = self.reminder_service.remove_reminder(reminder_id)
        return res

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
                        self.edit_signal.emit({
                            'type': api_type,
                            'args': signal_args
                        })
                    return res
                return api_method

            api_method = create_api(original_func, success_cond, name)
            setattr(self, name, api_method.__get__(self))
    
    def undo(self):
        self.undo_request.emit()
        self.edit_signal.emit({
            'type': '',
            'args':{}
        })

    # def add_node(self, parent_node_id, new_node_name, new_node_id=None):
    #     res = self.tree.add_node(parent_node_id, new_node_name, new_node_id)
    #     if res is not None:
    #         self.edit_signal.emit({
    #             'type': 'add_node',
    #             'args':{
    #                 'parent_node_id': parent_node_id,
    #                 'new_node_name': new_node_name,
    #                 'new_node_id': res.identity,
    #             }
    #         })
    #     return res
    
    # def reopen_node(self, node_id):
    #     res = self.tree.reopen_node(node_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'reopen_node',
    #             'args':{
    #                 'node_id': node_id
    #             }
    #         })
    #     return res
    
    # def complete_node(self, node_id):
    #     res = self.tree.complete_node(node_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'complete_node',
    #             'args':{
    #                 'node_id': node_id
    #             }
    #         })
    #     return res
    
    # def complete_current(self):
    #     res = self.tree.complete_current()
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'complete_current',
    #             'args':{}
    #         })
    #     return res
    
    # def switch_to(self, node_id):
    #     res = self.tree.switch_to(node_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'switch_to',
    #             'args':{
    #                 'node_id': node_id
    #             }
    #         })
    #     return res
    
    # def remove_node(self, node_id):
    #     res = self.tree.remove_node(node_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'remove_subtree',
    #             'args':{
    #                 'node_id': node_id
    #             }
    #         })
    #     return res
    
    # def remove_subtree(self, node_id):
    #     res = self.tree.remove_subtree(node_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'remove_subtree', 
    #             'args':{
    #                 'node_id': node_id
    #             }
    #         })
    #     return res
    
    # def remove_subtree(self, node_id):
    #     res = self.tree.remove_subtree(node_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'remove_subtree', 
    #             'args':{
    #                 'node_id': node_id
    #             }
    #         })
    #     return res
    
    # def move_node(self, node_id, new_parent_id):
    #     res = self.tree.move_node(node_id, new_parent_id)
    #     if res == 0:
    #         self.edit_signal.emit({
    #             'type': 'move_node',
    #             'args':{
    #                 'node_id': node_id,
    #                 'new_parent_id': new_parent_id
    #             }
    #         })
    #     return res
