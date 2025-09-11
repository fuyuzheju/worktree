from .command_bases import Command
from typing import override

class LogoutCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "logout"
    
    @classmethod
    @override
    def command_help(cls):
        return "logout a user.\n" \
            "Usage: logout"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, context, shell):
        user_id = self.args["arguments"]["required"][0]
        context.users_manager.logout()
        self.output_signal.emit(f"Logged out.\n")
        return 0
    
    @override
    def auto_complete(self, context, shell):
        return None, []
