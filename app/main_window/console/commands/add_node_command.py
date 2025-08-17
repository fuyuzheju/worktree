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
        return "add a node as a child of the current node.\n" \
            "Usage: add <node_name>"
    
    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 1, # node_name
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        name = self.args["arguments"]["required"][0]
        if '.' in name or '/' in name or ':' in name or name == '':
            self.error_signal.emit("Error: Invalid node name.\n")
            return 1
        # search for node
        current_node = tree.tree.current_node
        for child in current_node.children:
            if child.name == name:
                self.error_signal.emit("Error: Node already exists.\n")
                return -1

        new_node = tree.add_node(current_node.identity, name, str(uuid.uuid4()))

        # switch to the new node
        self.output_signal.emit("Node added successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree):
        return None, []