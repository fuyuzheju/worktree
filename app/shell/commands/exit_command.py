from .command_bases import Command
from typing import override

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
    def execute(self, work_tree, shell):
        from ...controls import quit_signal
        quit_signal.emit()
    
    @override
    def auto_complete(self, work_tree, shell):
        return None, []