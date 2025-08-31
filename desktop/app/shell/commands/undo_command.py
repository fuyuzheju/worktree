from .command_bases import Command
from typing import override

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
    def command_arguments_numbers(self):
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
    def execute(self, context, shell):
        context.work_tree.undo()
        return 0
    
    @override
    def auto_complete(self, context, shell):
        return None, []