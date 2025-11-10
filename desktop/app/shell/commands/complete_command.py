from .command_bases import Command
from typing import override

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
    def command_arguments_numbers(self):
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
    def execute(self, context, shell):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]
        else:
            path = shell.pwd
        node = shell.path_parser(path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        res = context.work_tree.complete_node(node.identity)
        if res != 0:
            self.error_signal.emit(f"Error: Failed to complete node {path}.\n")
        return res
    
    @override
    def auto_complete(self, context, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return shell.path_completor(incomplete_path)
        return None, []