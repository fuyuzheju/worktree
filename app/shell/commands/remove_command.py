from .command_bases import Command
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
    
    @override
    def command_arguments_numbers(self):
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
    def execute(self, context, shell):
        path = self.args["arguments"]["required"][0]
        target = shell.path_parser(path)
        if target is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1

        if self.args["options"]["short"]["-r"] is None:
            st = context.work_tree.remove_node(target.identity)
        else:
            st = context.work_tree.remove_subtree(target.identity)
        if st != 0:
            self.error_signal.emit("Error: Failed to remove node.\n")
            return -1

        self.output_signal.emit("Node removed successfully.\n")
        return 0
    
    @override
    def auto_complete(self, context, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return shell.path_completor(incomplete_path)
        return None, []