from enum import Enum
from PyQt5.QtCore import QObject, pyqtSignal
import uuid, logging

logger = logging.getLogger(__name__)

class Status(Enum):
    """
    Status Clarification:
    Waiting: a workstep whose dependencies not completed, but not in current work
    Current: a workstep in current work (usually only one)
    Completed: a workstep completed
    """
    WAITING = "Waiting"
    CURRENT = "Current"
    COMPLETED = "Completed"


class Node:
    def __init__(self, name, identity=None, status: str=None, parent=None):
        self.identity = identity if identity else uuid.uuid4().hex
        self.name = name
        self.parent = parent
        self.children = []
        self.status = Status(status) if status else Status.WAITING # default status

    def addChild(self, child_node):
        self.children.append(child_node)

    def is_ready(self):
        for child in self.children:
            if child.status != Status.COMPLETED:
                return False
        return True

    def row(self):
        if self.parent:
            return self.parent.children.index(self)
        return 0

    def to_dict(self):
        """
        return a dict of the subtree
        """
        return {
            'identity': self.identity,
            'name': self.name,
            'status': self.status.value,
            'children': [child.to_dict() for child in self.children]
        }
    
    @classmethod
    def from_dict(cls, data):
        node = cls(data['name'], data['identity'], data['status'])
        for child_data in data['children']:
            child_node = cls.from_dict(child_data)
            node.addChild(child_node)
            child_node.parent = node
        return node
    
    def __repr__(self):
        return f"Node({self.name}, {self.status})"
    
    def __str__(self):
        return self.__repr__()


class WorkTree(QObject):
    undo_request = pyqtSignal()
    edit_signal = pyqtSignal(dict)

    """
    edit_signal: a signal to emit the edit data, which should contain the following keys:
    - 'type': the type of the edit, which can be 'add', 'remove', 'rename', 'move'
    - 'args': a list of arguments, which depends on the type of the edit
    """

    def __init__(self):
        super().__init__()
        self.root = Node("WorkRoot")
        self.root.status = Status.CURRENT
        self.current_node = self.get_current_node()
        self.edit_signal.connect(self.on_edit)
    
    def get_current_node(self, start_node=None):
        if start_node is None:
            start_node = self.root
        if start_node.status == Status.CURRENT:
            return start_node
        for child in start_node.children:
            found = self.get_current_node(child)
            if found:
                return found
        return None

    def get_node_by_id(self, identity, start_node=None):
        if start_node is None:
            start_node = self.root

        if start_node.identity == identity:
            return start_node
        
        for child in start_node.children:
            found = self.get_node_by_id(identity, child)
            if found:
                return found
        return None
    
    def on_edit(self, edit_data):
        # log
        logger.debug("Tree edited: %s", edit_data)

    def add_node(self, parent_node_id, new_node_name, new_node_id=None):
        parent_node = self.get_node_by_id(parent_node_id)
        if parent_node is None:
            return -1
        new_node = Node(new_node_name, 
                        identity=new_node_id,
                        parent=parent_node)
        parent_node.addChild(new_node)
        self.current_node.status = Status.WAITING
        self.current_node = new_node
        new_node.status = Status.CURRENT
        self.edit_signal.emit({
            'type': 'add_node',
            'args':{
                'parent_node_id': parent_node.identity,
                'new_node_name': new_node_name,
                'new_node_id': new_node.identity
            }
        })

        return new_node

    def reopen_node(self, node_id):
        node = self.get_node_by_id(node_id)
        if node is None or node.status != Status.COMPLETED:
            return -1
        def reopen(curr: Node):
            if curr.parent is not None and curr.parent.status == Status.COMPLETED:
                res = reopen(curr.parent)
                if res == -1:
                    return -1
            curr.status = Status.WAITING
            return 0
        
        if reopen(node) == -1:
            return -1
        self.edit_signal.emit({
            'type': 'reopen_node', 
            'args':{
                'node_id': node_id
            }
        })
        return 0

    def complete_node(self, node_id):
        node = self.get_node_by_id(node_id)
        if node is None or not node.is_ready():
            return -1
        node.status = Status.COMPLETED
        self.edit_signal.emit({
            'type': 'complete_node', 
            'args':{
                'node_id': node_id
            }
        })
        return 0

    def complete_current(self):
        if not self.current_node.is_ready():
            return -1
        self.current_node.status = Status.COMPLETED

        if self.current_node.parent is None:
            self.edit_signal.emit({
                'type': 'complete_current',
                'args': {}
            })
            return 0
        for child in self.current_node.parent.children:
            if child.status == Status.WAITING:
                self.current_node = child
                self.current_node.status = Status.CURRENT
                self.edit_signal.emit({
                    'type': 'complete_current',
                    'args': {}
                })
                return 0
        else:
            self.current_node = self.current_node.parent
            self.current_node.status = Status.CURRENT
            self.edit_signal.emit({
                'type': 'complete_current',
                'args': {}
            })
            return 0
    
    def switch_to(self, node_id):
        node = self.get_node_by_id(node_id)
        if node is None:
            return -1
        if node.status == Status.COMPLETED:
            return -1
        self.current_node.status = Status.WAITING
        self.current_node = node
        self.current_node.status = Status.CURRENT
        self.edit_signal.emit({
            'type': 'switch_to', 
            'args':{
                'node_id': node_id
            }
        })
        return 0
    
    def remove_node(self, node_id):
        node = self.get_node_by_id(node_id)
        if node is None:
            return -1
        if node.children or node == self.root or node == self.current_node:
            return -1
        node.parent.children.remove(node)
        self.edit_signal.emit({
            'type': 'remove_node', 
            'args':{
                'node_id': node_id
            }
        })
        return 0
    
    def remove_subtree(self, node_id):
        node = self.get_node_by_id(node_id)
        if node is None:
            return -1
        if node == self.root:
            return -1

        p = self.current_node
        while p != self.root:
            if p == node:
                return -1
            p = p.parent

        node.parent.children.remove(node)
        for child in node.children:
            self.remove_subtree(child.identity)
        self.edit_signal.emit({
            'type': 'remove_subtree', 
            'args':{
                'node_id': node_id
            }
        })
        return 0
    
    def move_node(self, node_id, new_parent_id):
        node = self.get_node_by_id(node_id)
        if node is None:
            return -1
        if node_id == self.root.identity:
            return -1
        new_parent = self.get_node_by_id(new_parent_id)
        if new_parent is None:
            return -1

        # you can't move a node to its child
        curr = new_parent
        while curr.identity != self.root.identity:
            if curr == node:
                return -1
            curr = curr.parent

        node.parent.children.remove(node)
        new_parent.addChild(node)
        node.parent = new_parent
        self.edit_signal.emit({
            'type': 'move_node',
            'args': {
                'node_id': node_id,
                'new_parent_id': new_parent_id
            }
        })

    def undo(self):
        self.undo_request.emit()
        self.edit_signal.emit({
            'type': 'undo',
            'args': {}
        })