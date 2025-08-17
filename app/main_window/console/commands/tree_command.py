from .command_bases import Command
from .utils import path_parser, path_completor
from ....data.tree import Node
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
    def command_arguments_numbers(self):
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
    def execute(self, tree):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]
            node = path_parser(path, tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.tree.current_node
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
    def auto_complete(self, tree):
        if len(self.args["arguments"]["optional"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["optional"][0]
        return path_completor(incomplete_path, tree)