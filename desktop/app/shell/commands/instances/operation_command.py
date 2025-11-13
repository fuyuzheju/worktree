from ..command_bases import CommandGroup, Subcommand, CommandArgsNumbers
from app.history.core import Operation, parse_operation
from typing import override, cast

class OperationCommand(CommandGroup):
    """
    Manage operations.
    """
    @classmethod
    @override
    def command_str(cls):
        return "op"
    
    @classmethod
    @override
    def command_help(cls):
        return "Manage operations.\n" \
            "Usage: rmd <subcommand>"

@OperationCommand.register_subcommand
class OperationListCommand(Subcommand):
    @classmethod
    @override
    def command_str(cls):
        return "ls"
    
    @classmethod
    @override
    def command_help(cls):
        return "List all operations.\n" \
            "Usage: rmd ls" \
            "\nOptions:" \
            "\n  -i, --including [mode]" \
            "\n     mode: c|p|a|confirmed|pending|all" \
            "\n  -s, --serial [num]" \
            "\n  -l, --long              show long format of operations."
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {"-i": 1, "-l": 0},
                "long": {"--including": 1, "--long": 0},
            }
        }
    
    @override
    def execute(self, shell):
        if self.args['options']['short']['-l'] is not None or self.args['options']['long']['--long'] is not None:
            def format_operation(operation: Operation, status: str, serial_num: str = "-"):
                status = {"c": "confirmed", "p": "pending"}[status]
                return f"[{serial_num}, {status}]\n" \
                    f"op_type: {operation.op_type.value}\n" \
                    f"payload: {operation.payload}\n" \
                    f"timestamp: {operation.timestamp}\n"
        else:
            def format_operation(operation: Operation, status: str, serial_num: str = ""):
                return f"[{serial_num}, {status}] {operation.op_type.value}\n" \
        
        mode = "p"
        if self.args['options']['short']['-i'] is not None:
            mode = self.args['options']['short']['-i'][0]
        if self.args['options']['long']['--including'] is not None:
            mode = self.args['options']['long']['--including'][0]
            mode = {"confirmed": "c", "pending": "p", "all": "a"}[mode]

        if not mode in ["a", "p", "c"]:
            self.error_signal.emit("Unknown mode.\n")
            return 1
        
        confirmed_head = shell.current_app.database.confirmed_history.get_head()
        length = 0 if confirmed_head is None else confirmed_head.serial_num
        serial_nums = list(range(1, length+1))

        for serial_num in serial_nums:
            node = shell.current_app.database.confirmed_history.get_by_serial_num(serial_num)
            assert node is not None
            confirmed_operation = parse_operation(node.operation)
            assert confirmed_operation is not None
            self.output_signal.emit(format_operation(confirmed_operation, "c", str(serial_num)))
        
        for node in shell.current_app.database.pending_queue.get_all():
            pending_operation = parse_operation(node.operation)
            assert pending_operation is not None
            self.output_signal.emit(format_operation(pending_operation, "p"))

        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []


@OperationCommand.register_subcommand
class OperationMetadataCommand(Subcommand):
    @classmethod
    @override
    def command_str(cls):
        return "meta"
    
    @classmethod
    @override
    def command_help(cls):
        return "List all metadata.\n" \
            "Usage: rmd meta" \
    
    @override
    def command_arguments_numbers(self) -> CommandArgsNumbers:
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {},
            }
        }
    
    @override
    def execute(self, shell):
        self.output_signal.emit("starting_serial_num: {}\n".format(
            shell.current_app.database.pending_queue.metadata.starting_serial_num)) # type: ignore
        head = shell.current_app.database.confirmed_history.get_head()
        self.output_signal.emit("head_serial: {}\n".format(0 if head is None else head.serial_num))

        return 0
    
    @override
    def auto_complete(self, shell):
        return None, []