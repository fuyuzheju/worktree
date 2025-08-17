from .command_bases import Command
from .utils import path_parser, path_completor
from typing import override

class CheckReadyCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "ck"
    
    @classmethod
    @override
    def command_help(cls):
        return "check whether if the current node is ready.\n" \
            "Usage: ck [path]"
    
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
        if self.args['arguments']['optional']:
            node = path_parser(self.args['arguments']['optional'][0], tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.current_node
        self.output_signal.emit("Current node is_ready: " + str(node.is_ready()) + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'optional'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["optional"][0]
            return path_completor(incomplete_path, tree)
        return None, []