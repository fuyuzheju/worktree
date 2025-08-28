from typing import override
from abc import ABC, abstractmethod, ABCMeta
from PyQt5.QtCore import pyqtSignal, QObject
from .utils import max_common_prefix
import time, copy

from typing import TypedDict, Optional, Any, Mapping
from ....data import WorkTree

COMMAND_REGISTRY: dict[str, type["Command"]] = {} # registry table of all commands, structure: {command_str: command_class}

# clarifications for options:
# short options are with one dash, while long options are with two dashes
# if an short option does the same thing as a long option, the short option will be prioritized
# e.g.
# -m "message1" --message "message2" 
# the message will finally be set to "message1"

class ParsedOptionsDict(TypedDict):
    short: dict[str, Optional[list[str]]] # the key should begin with '-'
    long: dict[str, Optional[list[str]]] # the key should begin with '--'
class ParsedArgumentsDict(TypedDict):
    required: list[str]
    optional: list[str]
class ParsedArgs(TypedDict):
    arguments: ParsedArgumentsDict
    options: ParsedOptionsDict

class OptionsNumbers(TypedDict):
    short: dict[str, int] # the key should begin with '-'
    long: dict[str, int] # the key should begin with '--'
class ArgumentsNumbers(TypedDict):
    required: int
    optional: int
class CommandArgsNumbers(TypedDict):
    options: OptionsNumbers
    arguments: ArgumentsNumbers


QObjectMeta = type(QObject)
class CustomMeta(QObjectMeta, ABCMeta): # type: ignore
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

    def __init__(self, *args: str) -> None:
        super().__init__()
        self.parts: list[str] = list(args)
        ca_num = self.command_arguments_numbers()
        self.args: ParsedArgs = {
            "arguments": {
                "required": [],
                "optional": []
            },
            "options": {
                "short": {
                    kw: None for kw in ca_num['options']['short'].keys()
                },
                "long": {
                    kw: None for kw in ca_num['options']['long'].keys()
                }
            }
        }
        self.last_arg: tuple[Optional[list[str]], int] = (None, -1) # Store the type of the last argument, to help auto complete
        res = self.parse_parts()
        self.status: int = res
        self.timestamp = time.time()
    
    def __init_subclass__(cls) -> None:
        if cls._register_globally:
            if hasattr(cls, 'command_str') and callable(cls.command_str) and cls.command_str() is not None:
                if cls.command_str() in COMMAND_REGISTRY:
                    raise ValueError(f"command {cls.command_str()} has already been registered")
                COMMAND_REGISTRY[cls.command_str()] = cls
        return super().__init_subclass__()

    def parse_parts(self) -> int:
        """
        parse the parts of the command into arguments and options
        value clarificatoin:
        None: the value of the argument or option is not set
        - for options:
            None: not chosen
            []: chosen, but no args provided
            {kw1: value1, ...}: chosen and with value provided
        
        return code:
        0: normal
        1: unknown option
        2: too many arguments
        3: too few arguments
        """

        def get_value(d: Mapping[str, Any], keys: list[str]):
            """
            get value from a multi-level dict by a list of keys
            """
            res = d
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

        ca_num = self.command_arguments_numbers()
        if ca_num['arguments']['optional'] > 0:
            stack.append(['arguments', 'optional'])
        if ca_num['arguments']['required'] > 0:
            stack.append(['arguments', 'required'])
        for part in self.parts:
            if part.startswith('-'):
                # option
                if part.startswith('--'):
                    # long option
                    if part in ca_num['options']['long']:
                        self.args['options']['long'][part] = []
                        stack.append(['options', 'long', part])
                    else:
                        # unknown long option
                        return 1
                else:
                    # short option
                    if part in ca_num['options']['short']:
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
                max_num = get_value(ca_num, stack[-1])
                
                current.append(part)
                self.last_arg = (stack[-1], self.last_arg[1] + 1)
                if len(current) == max_num:
                    stack.pop()

        # check if all required arguments are provided
        if len(self.args['arguments']['required']) != ca_num['arguments']['required']:
            return 3

        for option in ca_num['options']['short'].keys():
            got = self.args['options']['short'][option]
            if got is not None and len(got) != ca_num['options']['short'][option]:
                return 3
        for option in ca_num['options']['long'].keys():
            got = self.args['options']['long'][option]
            if got is not None and len(got) != ca_num['options']['long'][option]:
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

    @abstractmethod
    def command_arguments_numbers(self) -> CommandArgsNumbers:
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
    def execute(self, tree: WorkTree, shell: "Shell") -> int:
        """
        execute the command to operate the tree
        no need to call finish signal here
        all arguments are guaranteed to be provided to required numbers
        """
        pass
    
    @abstractmethod
    def auto_complete(self, tree: WorkTree, shell: "Shell") -> tuple[Optional[str], list[str]]:
        """
        auto complete the command
        :param incomplete_command: the incomplete command
        :return: a tuple of (completed_arg, possible_completion_list)
        """
        pass

    def __call__(self, tree: WorkTree, shell: "Shell") -> int:
        if self.status == 0:
            code = self.execute(tree, shell)
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
    
    def to_dict(self) -> dict[str, Any]:
        return {
            "command_str": self.command_str(),
            "args": self.args,
            "timestamp": self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Command":
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

    _subcommands: dict[str, type[Subcommand]] = {}

    def __init__(self, *args: str):
        self.subcommand: Optional[Subcommand] = None
        self.ca_num: CommandArgsNumbers = {
            "arguments": {
                "required": 1,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
        super().__init__(*args)
        if self.subcommand is not None:
            self.ca_num = self.subcommand.command_arguments_numbers()
            self.ca_num['arguments']['required'] += 1

    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        # default value here
        # if an instance has a subcommand, this method will be overrided in __init__()
        return self.ca_num
    
    @override
    def parse_parts(self) -> int:
        if self.parts:
            self.subcommand_str = self.parts[0]
            if self.subcommand_str in self._subcommands:
                self.subcommand = self._subcommands[self.subcommand_str](*self.parts[1:])
                self.args = copy.deepcopy(self.subcommand.args)
                self.args['arguments']['required'].insert(0, self.subcommand_str)
                self.last_arg = self.subcommand.last_arg

                return self.subcommand.status
                # here during the initialization, the __init__ method of subcommand has been called,
                # and the arguments will be parsed by the subcommand's parse_parts method.
            else:
                return 1
        else:
            self.parts = [''] # for auto_complete
            return 3
    
    @override
    def execute(self, work_tree: WorkTree, shell: "Shell") -> int:
        if self.subcommand is None:
            return 100
        self.subcommand.output_signal.connect(self.output_signal.emit)
        self.subcommand.error_signal.connect(self.error_signal.emit)
        self.subcommand.finish_signal.connect(self.finish_signal.emit)
        return self.subcommand.execute(work_tree, shell)
    
    @override
    def auto_complete(self, work_tree: WorkTree, shell: "Shell") -> tuple[Optional[str], list[str]]:
        if self.subcommand:
            return self.subcommand.auto_complete(work_tree, shell)
        else:
            possible_completion_list = []
            for subcommand_str in self._subcommands.keys():
                if subcommand_str.startswith(self.parts[0]):
                    possible_completion_list.append(subcommand_str)
            mcp = max_common_prefix(possible_completion_list)
            return mcp, possible_completion_list
    
    @classmethod
    def register_subcommand(cls, subcommand_class: type[Subcommand]):
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
