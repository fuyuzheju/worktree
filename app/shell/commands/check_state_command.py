from .command_bases import Command
from typing import override

class CheckStateCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "st"
    
    @classmethod
    @override
    def command_help(cls):
        return "view the state of a node.\n" \
            "Usage: st [path]"
    
    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 0, # node_path
                "optional": 1,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, work_tree, shell):
        if self.args["arguments"]["optional"][0]:
            path = self.args["arguments"]["optional"][0]
        else:
            path = shell.pwd
        node = shell.path_parser(path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        self.output_signal.emit("Node state: " + str(node.status.value) + '\n')
        return 0
    
    @override
    def auto_complete(self, work_tree, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return shell.path_completor(incomplete_path)
        return None, []