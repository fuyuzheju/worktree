from .command_bases import Command
from typing import override

class CompleteCurrentCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "cc"
    
    @classmethod
    @override
    def command_help(cls):
        return "complete the current node.\n" \
            "Usage: cc"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
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
    def execute(self, tree):
        res = tree.complete_current()
        if res == -1:
            self.error_signal.emit("Error: Current node is not ready yet.\n")
        elif res == 0:
            self.output_signal.emit("Current node completed successfully.\n")

        return 0
    
    @override
    def auto_complete(self, tree):
        return None, []