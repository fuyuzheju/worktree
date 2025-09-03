from PyQt5.QtCore import QObject, pyqtSignal
import logging

from typing import Optional
from ..data.core.tree import Node
from app.setup import AppContext

logger = logging.getLogger(__name__)

class Shell(QObject):
    """
    Generate command objects and run them.
    """
    output_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    finish_signal = pyqtSignal()
    post_command_signal = pyqtSignal(object) # to tell TreeGraphWidget to repaint, parameter: new pwd_node

    def __init__(self, context: AppContext) -> None:
        super().__init__()
        self.is_running_command = False
        self.context = context
        self.pwd = '/'
        self.pwd_node = self.context.work_tree.tree.root
        self.post_command_signal.emit(self.pwd_node) # to tell TreeGraphWidget to repaint
    
    def to_path(self, node: Node) -> str:
        if node.parent is None:
            return '/'
        
        return self.to_path(node.parent) + node.name + '/'

    def path_normalizer(self, path: str, path_separator: str = '/') -> str:
        """
        normalize the path,
        in which there is no '..' or '.',
        and transfer it to absolute path ending with the path separator.
        """
        if path == "":
            return self.pwd
        
        if not path.endswith(path_separator):
            path += path_separator

        if not path.startswith(path_separator):
            # relative path
            path = self.pwd + path
        
        parts = path.split(path_separator)
        new_parts: list[str] = []
        for part in parts:
            if part == '':
                continue
            elif part == '..':
                if len(new_parts) > 0:
                    new_parts.pop()
            elif part == '.':
                continue
            else:
                new_parts.append(part)

        new_path = path_separator.join(new_parts)
        if new_path:
            new_path = '/' + new_path + '/'
        else:
            new_path = '/'
        return new_path
            

    def path_parser(self, path: str, path_separator: str = '/') -> Optional[Node]:
        """
        parse the path and return the node
        :param path: the path to parse
        :param current: the current node, to which the path is relative, while needless for absolute path
        :return: the node; None when failed to find a node
        """
        path = self.path_normalizer(path, path_separator)

        parts = path.split(path_separator)[1:-1] # slice to exclude the empty parts at the endpoint
        current = self.context.work_tree.tree.root
        for p in parts:
            # search for node
            for child in current.children:
                if child.name == p:
                    current = child
                    break
            else:
                return None
        return current

    def path_completor(self, incomplete_path: str) -> tuple[Optional[str], list[str]]:
        from .commands.utils import max_common_prefix

        idx = incomplete_path.rfind('/')
        prefix = incomplete_path[:idx+1]
        suffix = incomplete_path[idx+1:]
        parent_node = self.path_parser(prefix)
        if parent_node is None:
            return None, []
        possible_completion_list = [prefix + child.name + '/'
                for child in parent_node.children if child.name.startswith(suffix)]
        mcp = max_common_prefix(possible_completion_list)
        return mcp, possible_completion_list
    
    def run_command(self, command_text: str) -> int:
        """
        run the command and return the output as a parameter to the callback function.
        :return: 0 for success, -1 for command error, 1 for invalid command
        """
        from .commands import COMMAND_REGISTRY

        parts = command_text.split()
        if len(parts) == 0:
            self.finish_signal.emit()
            return 0
        
        logger.debug(f"Running command: {command_text}")

        command_str = parts[0]
        command_class = COMMAND_REGISTRY.get(command_str)
        if command_class is None:
            self.error_signal.emit("Error: Invalid command.\n")
            self.finish_signal.emit()
            return 1

        command = command_class(*parts[1:])
        command.output_signal.connect(self.output_signal.emit)
        command.error_signal.connect(self.error_signal.emit)
        command.finish_signal.connect(self.finish_signal.emit)
        res = command(self.context, self)
        self.pwd_node = self.path_parser(self.pwd) # reload pwd node
        self.post_command_signal.emit(self.pwd_node) # to tell TreeGraphWidget to repaint
        return res

    def auto_complete(self, incomplete_command: str) -> tuple[Optional[str], list[str]]:
        from .commands.utils import max_common_prefix
        from .commands import COMMAND_REGISTRY

        if incomplete_command == '':
            return None, []
        parts = incomplete_command.split()
        if incomplete_command[-1] == ' ':
            parts.append('')
        if len(parts) == 0:
            return None, []

        if len(parts) == 1:
            # complete command name
            possible_completion_list = [
                command for command in COMMAND_REGISTRY.keys()
                if command.startswith(parts[0])
            ]

            mcp = max_common_prefix(possible_completion_list)
            return mcp, possible_completion_list
        
        else:
            # complete command arguments
            command_class = COMMAND_REGISTRY.get(parts[0])
            if command_class is not None:
                command = command_class(*parts[1:])
                return command.auto_complete(self.context, self)
        
        return None, []