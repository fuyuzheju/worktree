from enum import Enum
from pydantic import TypeAdapter, ValidationError
from typing import TypedDict, Union, Any, Optional
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

OperationPayload = {
    "add_node": AddNodePayload,
    "reopen_node": ReopenNodePayload,
    "complete_node": CompleteNodePayload,
    "remove_node": RemoveNodePayload,
    "remove_subtree": RemoveSubtreePayload,
    "move_node": MoveNodePayload,
}
OperationPayloadUnion = Union[AddNodePayload,
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
                 payload: OperationPayloadUnion,
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

def parse_operation(op_str: str) -> Optional[Operation]:
    try:
        data = json.loads(op_str)
    except json.JSONDecodeError:
        return None
    
    if not ("op_type" in data and "payload" in data and "timestamp" in data \
            and isinstance(data["op_type"], str) and isinstance(data["payload"], dict) and isinstance(data["timestamp"], int)):
        return None

    try:
        op_type = OperationType(data["op_type"])
    except ValueError:
        return None
    
    operation_validator = TypeAdapter(OperationPayload[data["op_type"]])
    try:
        parsed_payload = operation_validator.validate_python(data["payload"])
    except ValidationError as e:
        return None
    
    return Operation(op_type=op_type,
                     payload=data["payload"],
                     timestamp=data["timestamp"])
