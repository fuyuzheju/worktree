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
        """
        Note: due the the sync algorithm, a conflict may occur in the case below:
        if the things happen in the order below:
        1. user does an operation (pushed to pending queue)
        2. sender sends the operation to server
        3. user does undo (now the operation in pending queue is popped)
        4. server confirms the operation
        5. receiver push it to confirmed history
        Now the operation is still in the history!
        The `undo` has lost effect in this case.
        But no graceful way is found to solve this.
        """
        raise NotImplementedError()
        if shell.current_app.database.pending_queue.is_empty():
            # undo confirmed history
            pass
        else:
            # undo pending queue
            shell.current_app.database.pending_queue.pop_tail()
        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []