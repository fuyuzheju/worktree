from ..command_bases import Command, CommandArgsNumbers
from app.history.core import Operation, OperationType
from typing import override
import time

class CompleteCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "cpl"
    
    @classmethod
    @override
    def command_help(cls):
        return "view the state of a node.\n" \
            "Usage: cpl [path]"
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        return {
            "arguments": {
                "required": 0,
                "optional": 1, # node path
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, shell):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]
        else:
            path = shell.pwd
        node = shell.path_parser(path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        
        op = Operation(OperationType.COMPLETE_NODE, {
            "node_id": node.identity,
        }, timestamp=int(time.time()))
        if shell.current_app.loader.check(op):
            shell.current_app.database.pending_queue.push(op)
            return 0
        else:
            self.error_signal.emit(f"Error: Failed to complete node {path}.\n")
            return -1
    
    @override
    def auto_complete(self, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return shell.path_completor(incomplete_path)
        return None, []