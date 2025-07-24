from abc import ABC, abstractmethod
from typing import override
from PyQt5.QtCore import pyqtSignal, QObject
import time
from .utils import path_parser, max_common_prefix

COMMAND_REGISTRY = {} # registry table of all commands, structure: {command_str: command_class}

class CustomMeta(type(QObject), type(ABC)):
    pass

class Command(ABC, QObject, metaclass=CustomMeta):
    """
    the abstract base class of all commands
    methods and properties:
    - command_str: the name of the command
    - command_help: the help message of the command
    - execute: the method to execute the command and operate the tree
    - args: arguments of the command instance
    """
    output_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    finish_signal = pyqtSignal()

    def __init__(self, *args):
        super().__init__()
        self.parts = args
        res = self.parse_parts()
        self.status = res # 0: normal command, non-zero: error command
        self.timestamp = time.time()
    
    def __init_subclass__(cls) -> None:
        COMMAND_REGISTRY[cls.command_str()] = cls
        return super().__init_subclass__()

    def parse_parts(self):
        """
        parse the parts of the command into arguments and options
        value clarificatoin:
        None: the value of the argument or option is not set
        - for options:
            {}: chosen, but no args provided
            {kw1: value1, ...}: chosen and with value provided
        """
        self.args = {
            "arguments": {
                "required": [],
                "optional": []
            },
            "options": {
                "short": {
                    kw: None for kw in self.command_arguments_numbers()['options']['short'].keys()
                },
                "long": {
                    kw: None for kw in self.command_arguments_numbers()['options']['long'].keys()
                }
            }
        }

        def get_value(d: dict, keys: list[str]):
            """
            get value from a multi-level dict by a list of keys
            """
            res = d.copy()
            for key in keys:
                res = res[key]
            return res

        stack = [['arguments', 'optional'], ['arguments', 'required']] # stack to store the currently parsed things, which still requires arguments
        for part in self.parts:
            if part.startswith('-'):
                # option
                if part.startswith('--'):
                    # long option
                    if part in self.command_arguments_numbers()['options']['long']:
                        self.args['options']['long'][part] = []
                        stack.append(['options', 'long', part])
                    else:
                        # unknown long option
                        return 1
                else:
                    # short option
                    if part in self.command_arguments_numbers()['options']['short']:
                        self.args['options']['short'][part] = []
                        stack.append(['options', 'short', part])
                    else:
                        # unknown short option
                        return 1
            else:
                # argument
                while stack:
                    # argument for the currently parsed thing
                    current = get_value(self.args, stack[-1])
                    max_num = get_value(self.command_arguments_numbers(), stack[-1])
                    if len(current) < max_num:
                        break
                    else:
                        stack.pop()
                
                if not stack:
                    # too many arguments
                    return 2
                
                current.append(part)
        
        # TODO: here is to help auto complete to mark the last argument -----------------------
        self.arg_stack = stack

        # check if all required arguments are provided
        if len(self.args['arguments']['required']) != self.command_arguments_numbers()['arguments']['required']:
            return 3

        for option in self.command_arguments_numbers()['options']['short'].keys():
            got = self.args['options']['short'][option]
            if got and len(got) != self.command_arguments_numbers()['options']['short'][option]:
                return 3
        for option in self.command_arguments_numbers()['options']['long'].keys():
            got = self.args['options']['long'][option]
            if got and len(got) != self.command_arguments_numbers()['options']['long'][option]:
                return 3
        
        return 0
    
    @classmethod
    @abstractmethod
    def command_str(cls) -> str:
        pass
    
    @classmethod
    @abstractmethod
    def command_help(cls) -> str:
        pass

    @classmethod
    @abstractmethod
    def command_arguments_numbers(cls) -> dict:
        """
        return the arguments required and optional for the command
        :return: {
            "arguments": {
                "required": `num`, 
                "optional": `num`,
            },
            "options": {
                "short": {
                    `-name`: `num`,
                },
                "long": {
                    `--name`: `num`,
                }
            }
        }
        `num` refers to the number of required arguments
        """
        pass

    @abstractmethod
    def execute(self, tree) -> int:
        """
        execute the command to operate the tree
        no need to call finish signal here
        all arguments are guaranteed to be provided to required numbers
        """
        pass
    
    @abstractmethod
    def auto_complete(self) -> tuple[str, list[str]]:
        """
        auto complete the command
        :param incomplete_command: the incomplete command
        :return: a tuple of (completed_arg, possible_completion_list)
        """
        pass

    def __call__(self, tree) -> int:
        if self.status == 0:
            code = self.execute(tree)
        elif self.status == 1:
            self.error_signal.emit("Error: Unknown option.\n")
            code = 101
        elif self.status == 2:
            self.error_signal.emit("Error: Too many arguments.\n")
            code = 102
        elif self.status == 3:
            self.error_signal.emit("Error: Not enough arguments.\n")
            code = 103

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
    @override
    def command_str(cls) -> str:
        return "cc"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "complete the current node.\n" \
            "Usage: cc"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        res = tree.complete_current()
        if res == -1:
            self.error_signal.emit("Error: Current node is not ready yet.\n")
        elif res == 0:
            self.output_signal.emit("Current node completed successfully.\n")

        return 0
    
    @override
    def auto_complete(self) -> tuple[str | None, list[str]]:
        return None, []


class ReopenCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "reopen"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "reopen the completed node.\n" \
            "Usage: reopen <path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 1,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        path = self.args["arguments"]["required"][0]
        node = path_parser(path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        res = tree.reopen_node(node.identity)
        if res == -1:
            self.error_signal.emit("Error: Node is not completed.\n")
            return -1        
        self.output_signal.emit("Node reopened successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["required"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["required"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list

class CheckReadyCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "ck"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "check whether if the current node is ready.\n" \
            "Usage: ck [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": 1,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        if self.args['arguments']['optional']:
            node = path_parser(self.args['arguments']['optional'][0], tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.current_node
        self.output_signal.emit("Current node is_ready: " + str(node.is_ready()) + '\n')
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["optional"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["optional"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class SwitchCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "cd"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "change current node.\n" \
            "Usage: cd <path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 1,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        path = self.args["arguments"]["required"][0]
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
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["required"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["required"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class AddNodeCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "add"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "add a node as a child of the current node.\n" \
            "Usage: add <node_name>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 1,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree: 'WorkTree'):
        name = self.args["arguments"]["required"][0]
        if '.' in name or '/' in name or ':' in name or name == '':
            self.error_signal.emit("Error: Invalid node name.\n")
            return 1
        # search for node
        current_node = tree.tree.current_node
        for child in current_node.children:
            if child.name == name:
                self.error_signal.emit("Error: Node already exists.\n")
                return -1

        new_node = tree.add_node(current_node.identity, name)

        # switch to the new node
        self.output_signal.emit("Node added successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        return None, []


class ListCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "ls"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "list the children of the current node.\n" \
            "Usage: ls [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": 1,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree: 'WorkTree'):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]   
            node = path_parser(path, tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.tree.current_node
        self.output_signal.emit("Children of node " + node.name + ":\n")
        for child in node.children:
            self.output_signal.emit(child.name + '\n')
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["optional"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["optional"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class TreeCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "tree"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "view the tree structure.\n" \
            "Usage: tree [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": 1,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree: 'WorkTree'):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]
            node = path_parser(path, tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.tree.current_node
        self.output_signal.emit("Tree structure:\n")
        def print_tree(prefix: str, node: 'Node', is_last=True):
            self.output_signal.emit(prefix + ('└── ' if is_last else '├── ') + node.name + '\n')
            child_count = len(node.children)
            for idx, child in enumerate(node.children):
                is_child_last = (idx == child_count - 1)
                new_prefix = prefix + ('    ' if is_last else '│   ')
                print_tree(new_prefix, child, is_child_last)
        print_tree('', node, True)
        return 0

    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["optional"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["optional"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class RemoveCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "rm"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "remove a leaf node or a subtree.\n" \
            "Usage: rm <path> [-r]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 1,
                "optional": 0,
            },
            "options": {
                "short": {
                    "-r": 0,
                },
                "long": {}
            }
        }
    
    @override
    def execute(self, tree: 'WorkTree'):
        path = self.args["arguments"]["required"][0]
        target = path_parser(path, tree)
        if target is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1

        if self.args["options"]["short"]["-r"] is None:
            st = tree.remove_node(target.identity)
        else:
            st = tree.remove_subtree(target.identity)
        if st != 0:
            self.error_signal.emit("Error: Failed to remove node.\n")
            return -1

        self.output_signal.emit("Node removed successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["required"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["required"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class MoveCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "mv"

    @classmethod
    @override
    def command_help(cls) -> str:
        return "move a node(subtree) to a new path.\n" \
            "Usage: mv <node_path> <new_parent_path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 2,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree: 'WorkTree'):
        node_path = self.args["arguments"]["required"][0]
        new_parent_path = self.args["arguments"]["required"][1]
        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit(f"Error: No such node {node_path}.\n")
            return -1
        new_parent = path_parser(new_parent_path, tree)
        if new_parent is None:
            self.error_signal.emit(f"Error: No such node {new_parent_path}.\n")
            return -1
        res = tree.move_node(node.identity, new_parent.identity)
        if res == -1:
            self.error_signal.emit("Failed to move node.\n")
            return -1
        self.output_signal.emit("Node moved successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if not len(self.args["arguments"]["required"]) in [1, 2]:
            return None, []
        incomplete_path = self.args["arguments"]["required"][-1]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class CheckStateCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "st"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "view the state of a node.\n" \
            "Usage: st <node_path>"

    @override
    def execute(self, tree: 'WorkTree'):
        node_path = self.args["arguments"]["required"][0]
        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        self.output_signal.emit("Node state: " + str(node.status) + '\n')
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if len(self.args["arguments"]["required"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["required"][0]
        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = path_parser(prefix, tree)
        if parent_node is None:
            return None, []
        possible_completion_list = []
        for child in parent_node.children:
            if child.name.startswith(suffix):
                possible_completion_list.append(prefix + child.name + '/')
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list


class UndoCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "undo"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "undo the last operation.\n" \
            "Usage: undo"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree: 'WorkTree'):
        tree.undo()
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        return None, []


class ExitCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "exit"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "exit the whole app.\n" \
            "Usage: exit"
    
    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree: 'WorkTree'):
        from ...controls import quit_signal
        quit_signal.emit()
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        return None, []


class HelpCommand(Command):
    @classmethod
    @override
    def command_str(cls) -> str:
        return "help"
    
    @classmethod
    @override
    def command_help(cls) -> str:
        return "view this help message.\n" \
            "Usage: help [command...]"

    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return {
            "arguments": {
                "required": 0,
                "optional": float('inf'),
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree: 'WorkTree'):
        if not self.args["arguments"]["optional"]:
            command_list = COMMAND_REGISTRY.keys()
        else:
            command_list = self.args["arguments"]["optional"]
        for command in command_list:
            if command in COMMAND_REGISTRY:
                self.output_signal.emit("- " + command + "\n" + COMMAND_REGISTRY[command].command_help() + "\n\n")
            else:
                self.error_signal.emit(f"Error: No such command {command}.\n")
                return -1
        
        return 0
    
    @override
    def auto_complete(self, tree) -> tuple[str | None, list[str]]:
        if not self.args["arguments"]["optional"]:
            return None, []
        incomplete_command = self.args["arguments"]["optional"][-1]
        possible_completion_list = []
        for command in COMMAND_REGISTRY.keys():
            if command.startswith(incomplete_command):
                possible_completion_list.append(command)
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list
