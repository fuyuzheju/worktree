from .command_bases import Command
from .utils import path_parser, path_completor
from typing import override

class CheckStateCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "st"
    
    @classmethod
    @override
    def command_help(cls):
        return "view the state of a node.\n" \
            "Usage: st <node_path>"

    @override
    def execute(self, tree):
        node_path = self.args["arguments"]["required"][0]
        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        self.output_signal.emit("Node state: " + str(node.status) + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []