from .command_bases import Command
from .utils import path_parser, path_completor
from typing import override

class RemoveCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "rm"
    
    @classmethod
    @override
    def command_help(cls):
        return "remove a leaf node or a subtree.\n" \
            "Usage: rm <path> [-r]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1, # node_path
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
    def execute(self, tree):
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
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []