from ..command_bases import Command, CommandArgsNumbers
from app.history.core import Operation, OperationType
from typing import override
import time

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
    def command_arguments_numbers(self) -> CommandArgsNumbers:
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
    def execute(self, shell):
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
        
        op = Operation(OperationType.MOVE_NODE, {
            "node_id": node.identity,
            "new_parent_id": new_parent.identity,
        }, timestamp=int(time.time()))

        if shell.current_app.loader.check(op):
            shell.current_app.database.pending_queue.push(op)
        else:
            self.error_signal.emit("Failed to move node.\n")
            return -1

        self.output_signal.emit("Node moved successfully.\n")
        return 0
    
    @override
    def auto_complete(self, shell):
        if self.last_arg[0] == ['arguments', 'required'] and (self.last_arg[1] == 0 or self.last_arg[1] == 1):
            incomplete_path = self.args["arguments"]["required"][-1]
            return shell.path_completor(incomplete_path)
        return None, []