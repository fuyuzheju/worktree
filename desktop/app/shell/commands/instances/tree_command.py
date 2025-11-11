from ..command_bases import Command, CommandArgsNumbers
from app.history.core import Node
from typing import override

class TreeCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "tree"
    
    @classmethod
    @override
    def command_help(cls):
        return "view the tree structure.\n" \
            "Usage: tree [path]"
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
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
    def execute(self, shell):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]
        else:
            path = shell.pwd
        node = shell.path_parser(path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        self.output_signal.emit("Tree structure:\n")
        def print_tree(prefix: str, node: Node, is_last=True):
            self.output_signal.emit(prefix + ('└── ' if is_last else '├── ') + node.name + '\n')
            child_count = len(node.children)
            for idx, child in enumerate(node.children):
                is_child_last = (idx == child_count - 1)
                new_prefix = prefix + ('    ' if is_last else '│   ')
                print_tree(new_prefix, child, is_child_last)
        print_tree('', node, True)
        return 0
    
    @override
    def auto_complete(self, shell):
        if len(self.args["arguments"]["optional"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["optional"][0]
        return shell.path_completor(incomplete_path)