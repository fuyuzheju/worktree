from .command_bases import Command
from typing import override

class MoveCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "mv"

    @classmethod
    @override
    def command_help(cls):
        return "move a node(subtree) to a new path.\n" \
            "Usage: mv <node_path> <new_parent_path>"
    
    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 2, # node_path, new_parent_path
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, context, shell):
        node_path = self.args["arguments"]["required"][0]
        new_parent_path = self.args["arguments"]["required"][1]
        node = shell.path_parser(node_path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {node_path}.\n")
            return -1
        new_parent = shell.path_parser(new_parent_path)
        if new_parent is None:
            self.error_signal.emit(f"Error: No such node {new_parent_path}.\n")
            return -1
        res = context.work_tree.move_node(node.identity, new_parent.identity)
        if res == -1:
            self.error_signal.emit("Failed to move node.\n")
            return -1
        self.output_signal.emit("Node moved successfully.\n")
        return 0
    
    @override
    def auto_complete(self, context, shell):
        if self.last_arg[0] == ['arguments', 'required'] and (self.last_arg[1] == 0 or self.last_arg[1] == 1):
            incomplete_path = self.args["arguments"]["required"][-1]
            return shell.path_completor(incomplete_path)
        return None, []