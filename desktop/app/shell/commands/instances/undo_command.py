from ..command_bases import Command, CommandArgsNumbers
from typing import override
import time

class UndoCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "undo"
    
    @classmethod
    @override
    def command_help(cls):
        return "undo the last operation.\n" \
            "Usage: undo"
    
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
        context.users_manager.storage.history_storage.undo()
        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []