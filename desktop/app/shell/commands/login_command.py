from .command_bases import Command
from typing import override

class LoginCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "login"
    
    @classmethod
    @override
    def command_help(cls):
        return "Login a user.\n" \
            "Usage: login <user_id>"
    
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
        context.users_manager.login(user_id)
        self.output_signal.emit(f"Logged in as {user_id}.\n")
        return 0
    
    @override
    def auto_complete(self, context, shell):
        return None, []
