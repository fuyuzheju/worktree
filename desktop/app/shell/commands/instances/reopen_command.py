from ..command_bases import Command, CommandArgsNumbers
from app.history.core import Operation, OperationType
from typing import override
import time

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
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
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
    def execute(self, shell):
        path = self.args["arguments"]["required"][0]
        node = shell.path_parser(path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        
        op = Operation(OperationType.REOPEN_NODE, {
            "node_id": node.identity
        }, timestamp=int(time.time()))
        if shell.current_app.loader.check(op):
            shell.current_app.database.pending_queue.push(op)
        else:
            self.error_signal.emit("Error: Node is not completed.\n")
            return -1        
        self.output_signal.emit("Node reopened successfully.\n")
        return 0
    
    @override
    def auto_complete(self, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return shell.path_completor(incomplete_path)
        return None, []