from .command_bases import Command
from typing import override
import uuid

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
    def command_arguments_numbers(self):
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
    def execute(self, work_tree, shell):
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

        res = work_tree.add_node(parent_node.identity, name, str(uuid.uuid4()))
        if res == -1:
            self.error_signal.emit("Error: Node already exists.\n")
            return -1

        # switch to the new node
        self.output_signal.emit("Node added successfully.\n")
        return 0
    
    @override
    def auto_complete(self, work_tree, shell):
        return None, []