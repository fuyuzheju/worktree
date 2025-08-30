from .command_bases import Command
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
    def execute(self, work_tree, shell):
        if self.args['arguments']['optional']:
            path = self.args['arguments']['optional'][0]
        else:
            path = shell.pwd

        node = shell.path_parser(path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        self.output_signal.emit("Current node is_ready: " + str(node.is_ready()) + '\n')
        return 0
    
    @override
    def auto_complete(self, work_tree, shell):
        if self.last_arg[0] == ['arguments', 'optional'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["optional"][0]
            return shell.path_completor(incomplete_path)
        return None, []