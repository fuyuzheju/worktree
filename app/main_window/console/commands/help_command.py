from .command_bases import Command
from .utils import max_common_prefix
from typing import override

class HelpCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "help"
    
    @classmethod
    @override
    def command_help(cls):
        return "view this help message.\n" \
            "Usage: help [command...]"

    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 0,
                "optional": 1024, # command_list
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        if not self.args["arguments"]["optional"]:
            command_list = COMMAND_REGISTRY.keys()
        else:
            command_list = self.args["arguments"]["optional"]
        for command in command_list:
            if command in COMMAND_REGISTRY:
                self.output_signal.emit("- " + command + "\n" + COMMAND_REGISTRY[command].command_help() + "\n\n")
            else:
                self.error_signal.emit(f"Error: No such command {command}.\n")
                return -1
        
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'optional']:
            incomplete_command = self.args["arguments"]["optional"][-1]
            possible_completion_list = [command for command in COMMAND_REGISTRY.keys()
                    if command.startswith(incomplete_command)]
            mcp = max_common_prefix(possible_completion_list)
            return mcp, possible_completion_list
        return None, []