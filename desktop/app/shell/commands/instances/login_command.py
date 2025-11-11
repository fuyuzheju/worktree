from ..command_bases import Command, CommandArgsNumbers
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
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        return {
            "arguments": {
                "required": 2,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, shell):
        username = self.args["arguments"]["required"][0]
        password = self.args["arguments"]["required"][1]
        code, message = shell.current_app.requester.login(username, password)
        if code == 0:
            self.output_signal.emit(f"Logged in as {username}.\n")
        else:
            self.error_signal.emit(f"Fail. {message}")
        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []
