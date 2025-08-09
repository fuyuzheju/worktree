from .command_bases import Command
from .utils import path_parser, path_completor
from typing import override

class ReopenCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "reopen"
    
    @classmethod
    @override
    def command_help(cls):
        return "reopen the completed node.\n" \
            "Usage: reopen <path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1, # node_path
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
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []