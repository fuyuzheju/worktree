from enum import Enum
from typing import TypedDict, Union, Any
from .tree import Tree
import json

class OperationType(Enum):
    ADD_NODE = "add_node"
    REOPEN_NODE = "reopen_node"
    COMPLETE_NODE = "complete_node"
    REMOVE_NODE = "remove_node"
    REMOVE_SUBTREE = "remove_subtree"
    MOVE_NODE = "move_node"


class AddNodePayload(TypedDict):
    parent_node_id: str
    new_node_name: str
    new_node_id: str
class ReopenNodePayload(TypedDict):
    node_id: str
class CompleteNodePayload(TypedDict):
    node_id: str
class RemoveNodePayload(TypedDict):
    node_id: str
class RemoveSubtreePayload(TypedDict):
    node_id: str
class MoveNodePayload(TypedDict):
    node_id: str
    new_parent_id: str

OperationPayload = Union[AddNodePayload,
                ReopenNodePayload,
                CompleteNodePayload,
                RemoveNodePayload,
                RemoveSubtreePayload,
                MoveNodePayload]

class Operation:
    """
    Operation is one of the core classes in this application.
    Operation declares how a Tree behaves, and comprises all the history.
    Operations are stored in pending queue and confirmed history.
    """
    def __init__(self,
                 op_type: OperationType,
                 payload: OperationPayload,
                 timestamp: int):
        self.op_type = op_type
        self.payload = payload
        self.timestamp = timestamp
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "op_type": self.op_type.value,
            "payload": self.payload,
            "timestamp": self.timestamp,
        }
    
    def stringify(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(',', ':'), ensure_ascii=False)

    def apply(self, tree: Tree):
        method = getattr(tree, self.op_type.value)
        res = method(**self.payload)
        return res
