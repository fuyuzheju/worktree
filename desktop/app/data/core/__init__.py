from typing import TypedDict, Any, override
from enum import Enum
from abc import ABC, abstractmethod
from dataclasses import dataclass
import json

from .tree import Tree



class EditData(TypedDict):
    type: str
    args: dict[str, Any]


# ----- WARNING -----
# when you're trying to compare two operation types,
# don't directly compare them with 'type1 == type2',
# but do 'type1.value == type2.value'
# where type1 and type2 are OperationType or ExtOperation instances
# because logically ExtOperationType includes OperationType,
# but in the code they are two separated classes(no extending relationships)
# so instances of the two classes are different, even if their value are the same

class OperationType(Enum):
    ADD_NODE = "add_node"
    REOPEN_NODE = "reopen_node"
    COMPLETE_NODE = "complete_node"
    REMOVE_NODE = "remove_node"
    REMOVE_SUBTREE = "remove_subtree"
    MOVE_NODE = "move_node"

class PseudoOperationType(Enum):
    UNDO = "undo"
    # REDO = "redo"

class ExtOperationType(Enum):
    ADD_NODE = OperationType.ADD_NODE.value
    REOPEN_NODE = OperationType.REOPEN_NODE.value
    COMPLETE_NODE = OperationType.COMPLETE_NODE.value
    REMOVE_NODE = OperationType.REMOVE_NODE.value
    REMOVE_SUBTREE = OperationType.REMOVE_NODE.value
    MOVE_NODE = OperationType.MOVE_NODE.value
    
    # extended
    UNDO = PseudoOperationType.UNDO.value


@dataclass
class AbstractOperation(ABC):
    op_type: Enum
    payload: dict
    timestamp: int

    @classmethod
    @abstractmethod
    def _TYPE(cls):
        pass 

    def stringify(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    
    def to_dict(self) -> dict:
        return {
            "op_type": self.op_type.value,
            "payload": self.payload,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data):
        op_type = cls._TYPE()(data["op_type"])
        payload = data["payload"]
        timestamp = data["timestamp"]
        return cls(op_type, payload, timestamp)
    
    def apply(self, tree: Tree):
        method = getattr(tree, self.op_type, None)
        if method is None:
            raise RuntimeError(f"No operation named '{self.op_type}'")
        
        res = method(**self.payload)
        return res

@dataclass
class ExtOperation(AbstractOperation):
    @classmethod
    def _TYPE(cls):
        return ExtOperationType

@dataclass
class Operation(ExtOperation):
    @override
    @classmethod
    def _TYPE(cls):
        return OperationType



