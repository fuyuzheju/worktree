import uuid
from enum import Enum
from PyQt5.QtCore import QObject, pyqtSignal

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
    def __init__(self, name, parent=None):
        self.identity = uuid.uuid4().hex
        self.name = name
        self.parent = parent
        self.children = []
        self.status = Status.WAITING # default status

    def addChild(self, child_node):
        self.children.append(child_node)

    def is_ready(self):
        """检查所有前置步骤（子节点）是否都已完成"""
        for child in self.children:
            if child.status != Status.COMPLETED:
                return False
        return True

    def row(self):
        """返回该节点在其父节点的子节点列表中的索引"""
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
    
    def __repr__(self):
        return f"Node({self.name}, {self.status})"
    
    def __str__(self):
        return self.__repr__()


class WorkTree(QObject):
    edit_signal = pyqtSignal(dict)
    """管理整个工作树的逻辑"""
    def __init__(self):
        super().__init__()
        self.root = Node("WorkRoot")
        self.root.status = Status.CURRENT
        self.current_node = self.root

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

    def add_node(self, parent_node, new_node_name):
        new_node = Node(new_node_name, parent=parent_node)
        parent_node.addChild(new_node)
        self.current_node.status = Status.WAITING
        self.current_node = new_node
        new_node.status = Status.CURRENT
        self.edit_signal.emit({'type': 'add_node', 'args':{
            'parent_node': parent_node, 
            'new_node_name': new_node_name, 
            'new_node': new_node
        }})

        return new_node

    def complete_node(self, node):
        if not node.is_ready():
            return -1
        node.status = Status.COMPLETED
        self.edit_signal.emit({'type': 'complete_node', 'args':{'node': node}})
        return 0

    def complete_current(self):
        if not self.current_node.is_ready():
            return -1
        self.current_node.status = Status.COMPLETED

        if self.current_node.parent is None:
            self.edit_signal.emit({'type': 'complete_current'})
            return 0
        for child in self.current_node.parent.children:
            if child.status == Status.WAITING:
                self.current_node = child
                self.current_node.status = Status.CURRENT
                self.edit_signal.emit({'type': 'complete_current'})
                return 0
        else:
            self.current_node = self.current_node.parent
            self.current_node.status = Status.CURRENT
            self.edit_signal.emit({'type': 'complete_current'})
            return 0
    
    def switch_to(self, node):
        if node.status == Status.COMPLETED:
            return -1
        self.current_node.status = Status.WAITING
        self.current_node = node
        self.current_node.status = Status.CURRENT
        self.edit_signal.emit({'type': 'switch_to', 'args':{'node': node}})
        return 0
    
    def remove_node(self, node):
        if node.children or node == self.root:
            return -1
        node.parent.children.remove(node)
        self.edit_signal.emit({'type': 'remove_node', 'args':{'node': node}})
        return 0
    
    def remove_subtree(self, node):
        if node == self.root:
            return -1
        node.parent.children.remove(node)
        for child in node.children:
            self.remove_subtree(child)
        self.edit_signal.emit({'type': 'remove_subtree', 'args':{'node': node}})
        return 0
