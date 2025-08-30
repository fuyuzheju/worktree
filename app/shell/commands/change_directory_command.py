from .command_bases import Command
from typing import override

class ChangeDirectoryCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "cd"
    
    @classmethod
    @override
    def command_help(cls):
        return "change current node.\n" \
            "Usage: cd <path>"
    
    @override
    def command_arguments_numbers(self):
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
    def execute(self, work_tree, shell):
        path = self.args["arguments"]["required"][0]
        target = shell.path_parser(path)
        if target is None:
            self.error_signal.emit(f"Error: No such node {path}.\n")
            return -1
        shell.pwd = shell.to_path(target)
        shell.pwd_node = target
        self.output_signal.emit("Changed to node " + target.name + '\n')
        return 0
    
    @override
    def auto_complete(self, work_tree, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return shell.path_completor(incomplete_path)
        return None, []