from ..command_bases import Command, CommandArgsNumbers
from app.history.core import Operation, OperationType
from typing import override
import uuid, time

class AddNodeCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "add"
    
    @classmethod
    @override
    def command_help(cls):
        return "add a node as a child on pwd.\n" \
            "Usage: add <node_name> [parent_path]"
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        return {
            "arguments": {
                "required": 1, # node_name
                "optional": 1, # parent_path
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, shell):
        name = self.args["arguments"]["required"][0]
        if '.' in name or '/' in name or ':' in name or name == '':
            self.error_signal.emit("Error: Invalid node name.\n")
            return 1

        if self.args["arguments"]["optional"]:
            parent_path = self.args["arguments"]["optional"][0]
        else:
            parent_path = shell.pwd

        parent_node = shell.path_parser(parent_path)
        if parent_node is None:
            self.error_signal.emit(f"Error: No such node {parent_path}.\n")
            return -1

        op = Operation(OperationType.ADD_NODE, {
            "new_node_name": name,
            "parent_node_id": parent_node.identity,
            "new_node_id": str(uuid.uuid4().hex)
        }, timestamp=int(time.time()))

        if shell.current_app.loader.check(op):
            shell.current_app.database.pending_queue.push(op)

        else:
            self.error_signal.emit("Error: Node already exists.\n")
            return -1

        self.output_signal.emit("Node added successfully.\n")
        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []