from ..command_bases import Command, CommandArgsNumbers
from typing import override

class ListCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "ls"
    
    @classmethod
    @override
    def command_help(cls):
        return "list the children of the current node.\n" \
            "Usage: ls [path]"
    
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
        self.output_signal.emit("Children of node " + node.name + ":\n")
        for child in node.children:
            self.output_signal.emit(child.name + '\n')
        return 0
    
    @override
    def auto_complete(self, shell):
        if self.last_arg[0] == ['arguments', 'optional'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["optional"][0]
            return shell.path_completor(incomplete_path)
        return None, []