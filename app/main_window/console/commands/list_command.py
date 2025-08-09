from .command_bases import Command
from .utils import path_parser, path_completor
from typing import override

class ListCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "ls"
    
    @classmethod
    @override
    def command_help(cls):
        return "list the children of the current node.\n" \
            "Usage: ls [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0,
                "optional": 1, # node_path
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
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
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'optional'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["optional"][0]
            return path_completor(incomplete_path, tree)
        return None, []