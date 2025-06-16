from abc import ABC, abstractmethod
from PyQt5.QtCore import pyqtSignal, QObject
import time
from .utils import path_parser

COMMAND_REGISTRY = {}

class CustomMeta(type(QObject), type(ABC)):
    pass

class Command(ABC, QObject, metaclass=CustomMeta):
    output_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    finish_signal = pyqtSignal()

    def __init__(self, *args):
        super().__init__()
        self.args = args
        self.timestamp = time.time()
    
    def __init_subclass__(cls) -> None:
        COMMAND_REGISTRY[cls.command_str()] = cls
        return super().__init_subclass__()
    
    @classmethod
    @abstractmethod
    def command_str(cls) -> str:
        pass

    @abstractmethod
    def execute(self, tree) -> int:
        pass
    
    def __call__(self, tree) -> int:
        code = self.execute(tree)
        self.finish_signal.emit()
        return code
    
    def to_dict(self):
        return {
            "command_str": self.command_str(),
            "args": self.args,
            "timestamp": self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data):
        command_type_str = data['command_str']
        command_class = COMMAND_REGISTRY[command_type_str]
        if not command_class:
            raise ValueError(f"Unknown command type: {command_type_str}")
        
        instance = command_class(**data['args'])
        instance.timestamp = data['timestamp']
        return instance


class CompleteCurrentCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "cc"
    
    def execute(self, tree):
        res = tree.complete_current()
        if res == -1:
            self.error_signal.emit("Error: Current node is not ready yet.\n")
        elif res == 0:
            self.output_signal.emit("Current node completed successfully.\n")

        return 0


class CheckReadyCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "ck"

    def execute(self, tree):
        self.output_signal.emit("Current node is_ready: " + str(tree.current_node.is_ready()) + '\n')
        return 0


class SwitchCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "cd"

    def execute(self, tree):
        if len(self.args) != 1:
            self.error_signal.emit("Error: cd command requires one argument.\n")
            return 1

        path = self.args[0]
        target = path_parser(path, tree)
        if target is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        res = tree.switch_to(target.identity)
        if res == -1:
            self.error_signal.emit("Error: Node completed already.\n")
            return -1
        self.output_signal.emit("Switched to node " + target.name + '\n')
        return 0


class AddNodeCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "add"

    def execute(self, tree: 'WorkTree'):
        if len(self.args) != 1:
            self.error_signal.emit("Error: add command requires one argument.\n")
            return 1

        name = self.args[0]
        if '.' in name or '/' in name or ':' in name or name == '':
            self.error_signal.emit("Error: Invalid node name.\n")
            return 1
        # search for node
        current_node = tree.current_node
        for child in current_node.children:
            if child.name == name:
                self.error_signal.emit("Error: Node already exists.\n")
                return -1

        new_node = tree.add_node(current_node.identity, name)

        # switch to the new node
        self.output_signal.emit("Node added successfully.\n")
        return 0


class RemoveCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "rm"
    
    def execute(self, tree: 'WorkTree'):
        path = None
        recursive = False
        for arg in self.args:
            if arg == '-r':
                recursive = True
            else:
                if path == None:
                    path = arg
                else:
                    self.error_signal.emit("Error: too many arguments.\n")
                    return -1

        if path == None:
            self.error_signal.emit("Error: rm command requires an argument <path>.\n")
            return -1

        target = path_parser(path, tree)
        if target is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1

        if recursive:
            st = tree.remove_subtree(target.identity)
        else:
            st = tree.remove_node(target.identity)
        if st != 0:
            self.error_signal.emit("Error: Failed to remove node.\n")
            return -1

        self.output_signal.emit("Node removed successfully.\n")
        return 0


class CheckStateCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "st"
    
    def execute(self, tree: 'WorkTree'):
        if len(self.args) != 1:
            self.error_signal.emit("Error: st command requires an argument <node_path>.\n")
            return -1
        node_path = self.args[0]
        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        self.output_signal.emit("Node state: " + str(node.status) + '\n')
        return 0


class UndoCommand(Command):
    @classmethod
    def command_str(cls) -> str:
        return "undo"
    
    def execute(self, tree: 'WorkTree'):
        tree.undo()
        return 0