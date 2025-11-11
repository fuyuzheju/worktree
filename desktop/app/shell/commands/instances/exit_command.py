from ..command_bases import Command, CommandArgsNumbers
from typing import override
import sys

class ExitCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "exit"
    
    @classmethod
    @override
    def command_help(cls):
        return "exit the whole app.\n" \
            "Usage: exit"
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, shell):
        sys.exit(0)
        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []