from ..command_bases import Command, CommandArgsNumbers
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
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
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
    def execute(self, shell):
        user_id = self.args["arguments"]["required"][0]
        shell.current_app.user_manager.logout()
        self.output_signal.emit(f"Logged out.\n")
        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []
