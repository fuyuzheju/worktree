from .command_bases import Command
from .utils import path_parser, path_completor
from typing import override

class SwitchCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "cd"
    
    @classmethod
    @override
    def command_help(cls):
        return "change current node.\n" \
            "Usage: cd <path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
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
    def execute(self, tree):
        path = self.args["arguments"]["required"][0]
        target = path_parser(path, tree)
        if target is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        res = tree.switch_to(target.identity)
        if res == -1:
            self.error_signal.emit("Error: Node completed already.\n")
            return -1
        self.output_signal.emit("Switched to node " + target.name + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []