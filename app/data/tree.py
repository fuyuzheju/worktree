from enum import Enum
import uuid, logging

from typing import Optional

logger = logging.getLogger(__name__)

class Status(Enum):
    """
    Status Clarification:
    Waiting: a workstep waiting to be completed
    Completed: a workstep completed
    """
    WAITING = "Waiting"
    COMPLETED = "Completed"


class Node:
    def __init__(self, name: str, identity: Optional[str] = None, status: Optional[str] = None, parent: Optional['Node'] = None):
        self.identity = identity if identity else uuid.uuid4().hex
        self.name = name
        self.parent = parent
        self.children: list[Node] = []
        self.status: Status = Status(status) if status else Status.WAITING # default status

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


class Tree:
    def __init__(self):
        super().__init__()
        self.root = Node("WorkRoot")

    def get_node_by_id(self, identity: str, start_node=None) -> Optional[Node]:
        if start_node is None:
            start_node = self.root

        if start_node.identity == identity:
            return start_node
        
        for child in start_node.children:
            found = self.get_node_by_id(identity, child)
            if found:
                return found
        return None

    def add_node(self, parent_node_id: str, new_node_name: str, new_node_id: Optional[str] = None) -> int:
        parent_node = self.get_node_by_id(parent_node_id)
        if parent_node is None:
            return -1
        if new_node_name in [child.name for child in parent_node.children]:
            return -1
        new_node = Node(new_node_name, 
                        identity=new_node_id,
                        parent=parent_node)
        parent_node.addChild(new_node)
        return 0

    def reopen_node(self, node_id: str) -> int:
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

        return 0

    def complete_node(self, node_id: str) -> int:
        node = self.get_node_by_id(node_id)
        if node is None or not node.is_ready():
            return -1
        if node.status == Status.COMPLETED:
            return -1
        node.status = Status.COMPLETED
        return 0
    
    def remove_node(self, node_id: str) -> int:
        node = self.get_node_by_id(node_id)
        if node is None:
            return -1
        if node.children or node.parent is None:
            return -1
        node.parent.children.remove(node)
        return 0
    
    def remove_subtree(self, node_id: str) -> int:
        node = self.get_node_by_id(node_id)
        if node is None:
            return -1
        if node.parent is None:
            return -1

        node.parent.children.remove(node)
        return 0
    
    def move_node(self, node_id: str, new_parent_id: str) -> int:
        node = self.get_node_by_id(node_id)
        if node is None or node.parent is None:
            return -1

        new_parent = self.get_node_by_id(new_parent_id)
        if new_parent is None:
            return -1

        # you can't move a node to its child
        curr: Optional[Node] = new_parent
        while curr is not None and curr.identity != self.root.identity:
            if curr == node:
                return -1
            curr = curr.parent
        
        if any([child.name == node.name for child in new_parent.children]):
            return -1

        node.parent.children.remove(node)
        new_parent.addChild(node)
        node.parent = new_parent
        return 0