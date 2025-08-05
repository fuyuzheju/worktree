from abc import ABC, abstractmethod
from typing import override
from PyQt5.QtCore import pyqtSignal, QObject
from .utils import max_common_prefix
import time

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

    _register_globally = True

    def __init__(self, *args):
        super().__init__()
        self.parts = list(args)
        res = self.parse_parts()
        self.status = res # 0: normal command, non-zero: error command
        self.timestamp = time.time()
    
    def __init_subclass__(cls) -> None:
        if cls._register_globally:
            if hasattr(cls, 'command_str') and callable(cls.command_str) and cls.command_str() is not None:
                if cls.command_str() in COMMAND_REGISTRY:
                    raise ValueError(f"command {cls.command_str()} has already been registered")
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

        # separate short options
        # for example, '-al' to '-a' and '-l'
        i = 0
        while i < len(self.parts):
            if self.parts[i].startswith('-') and len(self.parts[i]) > 2:
                self.parts.insert(i + 1, '-' + self.parts[i][2:])
                self.parts[i] = '-' + self.parts[i][1]
            i += 1

        stack = [] # stack to store the currently parsed things, which still requires arguments
        self.last_arg = (None, -1) # Store the type of the last argument, to help auto complete
        if self.command_arguments_numbers()['arguments']['optional'] > 0:
            stack.append(['arguments', 'optional'])
        if self.command_arguments_numbers()['arguments']['required'] > 0:
            stack.append(['arguments', 'required'])
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
                if not stack:
                    self.last_arg = (None, -1)
                    return 2 # too many arguments

                # argument for the currently parsed thing
                current = get_value(self.args, stack[-1])
                max_num = get_value(self.command_arguments_numbers(), stack[-1])
                
                current.append(part)
                self.last_arg = (stack[-1], self.last_arg[1] + 1)
                if len(current) == max_num:
                    stack.pop()

        # check if all required arguments are provided
        if len(self.args['arguments']['required']) != self.command_arguments_numbers()['arguments']['required']:
            return 3

        for option in self.command_arguments_numbers()['options']['short'].keys():
            got = self.args['options']['short'][option]
            if got is not None and len(got) != self.command_arguments_numbers()['options']['short'][option]:
                return 3
        for option in self.command_arguments_numbers()['options']['long'].keys():
            got = self.args['options']['long'][option]
            if got is not None and len(got) != self.command_arguments_numbers()['options']['long'][option]:
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
    def auto_complete(self, tree: "WorkTree") -> tuple[str, list[str]]:
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
            self.error_signal.emit("Error: Unknown command or unknown option.\n")
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


class Subcommand(Command):
    _register_globally = False


class CommandGroup(Command):
    """

    A group command.
    It behaves like a normal command(and this is why it extends Command), with same apis,
    but it transfers the execution to subcommands in the implementations.
    A subclass of CommandGroup implements a group command, which is like a namespace of subcommands.
    Subcommands is not directly exposed to global COMMAND_REGISTRY.

    - register_subcommand: a decorator for subcommand classes.

    """

    _subcommands = {}

    def __init__(self, *args):
        self.subcommand = None
        super().__init__(*args)

    @classmethod
    @override
    def command_arguments_numbers(cls) -> dict:
        return None
    
    @override
    def parse_parts(self):
        if self.parts:
            self.subcommand_str = self.parts[0]
            if self.subcommand_str in self._subcommands:
                self.subcommand = self._subcommands[self.subcommand_str](*self.parts[1:])
                return self.subcommand.status
                # here during the initialization, the __init__ method of subcommand has been called,
                # and the arguments will be parsed by the subcommand's parse_parts method.
            else:
                return 1
        else:
            self.parts = [''] # for auto_complete
            return 3
    
    @override
    def execute(self, tree) -> int:
        self.subcommand.output_signal.connect(self.output_signal.emit)
        self.subcommand.error_signal.connect(self.error_signal.emit)
        self.subcommand.finish_signal.connect(self.finish_signal.emit)
        return self.subcommand.execute(tree)
    
    @override
    def auto_complete(self, tree: "WorkTree") -> tuple[str, list[str]]:
        if self.subcommand:
            return self.subcommand.auto_complete(tree)
        else:
            possible_completion_list = []
            for subcommand_str in self._subcommands.keys():
                if subcommand_str.startswith(self.parts[0]):
                    possible_completion_list.append(subcommand_str)
            mcp = max_common_prefix(possible_completion_list)
            return mcp, possible_completion_list
    
    @classmethod
    def register_subcommand(cls, subcommand_class):
        """
        A decorator,
        registering a subcommand to this command group.
        """
        if not issubclass(subcommand_class, Subcommand):
            raise TypeError(f"subcommand_class must be a subclass of Subcommand, not {subcommand_class}")
        
        if subcommand_class.command_str() in cls._subcommands:
            raise ValueError(f"subcommand {subcommand_class.command_str()} has already been registered")
        
        # register
        cls._subcommands[subcommand_class.command_str()] = subcommand_class
        return subcommand_class
