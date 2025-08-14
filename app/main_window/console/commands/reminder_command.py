from .command_bases import CommandGroup, Subcommand
from .utils import path_parser, time_parser, path_completor
import uuid
from typing import override

class ReminderCommand(CommandGroup):
    """
    Manage reminders.
    """
    @classmethod
    @override
    def command_str(cls):
        return "rmd"
    
    @classmethod
    @override
    def command_help(cls):
        return "Manage reminders.\n" \
            "Usage: rmd <subcommand>"


@ReminderCommand.register_subcommand
class ReminderListCommand(Subcommand):
    @classmethod
    @override
    def command_str(cls):
        return "ls"
    
    @classmethod
    @override
    def command_help(cls):
        return "List all reminders.\n" \
            "Usage: rmd ls" \
            "\nOptions:" \
            "\n  -a, --all    show all reminders, including inactive ones." \
            "\n  -l, --long   show long format of reminders."
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0,
                "optional": 0,
            },
            "options": {
                "short": {"-a": 0, "-l": 0},
                "long": {"--all": 0, "--long": 0},
            }
        }
    
    @override
    def execute(self, tree):
        if self.args['options']['short']['-l'] is not None or self.args['options']['long']['--long'] is not None:
            def format_reminder(reminder, index):
                return f"[{index}]   {reminder.message}     {reminder.node_id}     {reminder.due_time.isoformat()}     {reminder.active}     {reminder.reminder_id}\n"
        else:
            def format_reminder(reminder, index):
                return f"[{index}]   {reminder.message}     {reminder.due_time}\n"

        if self.args['options']['short']['-a'] is not None or self.args['options']['long']['--all'] is not None:
            for index, reminder in enumerate(tree.reminder_service.list_reminders()):
                self.output_signal.emit(format_reminder(reminder, index))
        
        else:
            for index, reminder in enumerate(tree.reminder_service.list_reminders()):
                if reminder.active:
                    self.output_signal.emit(format_reminder(reminder, index))
        return 0
    
    @override
    def auto_complete(self, tree):
        return None, []


@ReminderCommand.register_subcommand
class ReminderAddCommand(Subcommand):
    @classmethod
    @override
    def command_str(cls):
        return "add"
    
    @classmethod
    @override
    def command_help(cls):
        return "Not Implemented"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 2, # node_path, due_time_format
                "optional": 0,
            },
            "options": {
                "short": {"-m": 1},
                "long": {"--message": 1},
            }
        }
    
    @override
    def execute(self, tree):
        node_path = self.args["arguments"]["required"][0]
        due_time_format = self.args["arguments"]["required"][1]

        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1

        message = self.args["options"]["short"]["-m"] or self.args["options"]["long"]["--message"]
        if message is None:
            message = node.name
        else:
            message = message[0]
        
        try:
            due_time = time_parser(due_time_format)
        except ValueError as e:
            self.error_signal.emit(f"Error: {str(e)}\n")
            return -1
            
        tree.add_reminder(node.identity, due_time, message, str(uuid.uuid4()))
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][-1]
            return path_completor(incomplete_path, tree)
        return None, []



@ReminderCommand.register_subcommand
class ReminderRemoveCommand(Subcommand):
    @classmethod
    @override
    def command_str(cls):
        return "rm"
    
    @classmethod
    @override
    def command_help(cls):
        return "Not Implemented"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0, # reminder_id
                "optional": 1,
            },
            "options": {
                "short": {"-i": 1},
                "long": {"--index": 1},
            }
        }
    
    @override
    def execute(self, tree):
        if self.args["arguments"]["optional"]:
            reminder_id = self.args["arguments"]["optional"][0]

        else:
            index = self.args["options"]["short"]["-i"] or self.args["options"]["long"]["--index"]
            if index is None:
                self.error_signal.emit("Error: Please specify either the index or id of the reminder.\n")
                return -1
            try:
                index = int(index[0])
                reminder_id = tree.reminder_service.list_reminders()[index].reminder_id
            except IndexError:
                self.error_signal.emit("Error: No such reminder.\n")
                return -1
            except ValueError:
                self.error_signal.emit("Error: Invalid index.\n")
                return -1

        res = tree.remove_reminder(reminder_id)
        if res == -1:
            self.error_signal.emit("Error: No such reminder.\n")
            return -1
        self.output_signal.emit("Reminder removed.\n")
        return 0
    
    @override
    def auto_complete(self, tree):
        return None, []


@ReminderCommand.register_subcommand
class ReminderSetCommand(Subcommand):
    @classmethod
    @override
    def command_str(cls):
        return "set"
    
    @classmethod
    @override
    def command_help(cls):
        return "Not Implemented"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0, # reminder_id
                "optional": 1,
            },
            "options": {
                "short": {"-m": 1, "-t": 1, "-a": 1, "-i": 1},
                "long": {"--message": 1, "--time": 1, "--active": 1, "--index": 1},
            }
        }
    
    @override
    def execute(self, tree):
        if self.args["arguments"]["optional"]:
            reminder_id = self.args["arguments"]["optional"][0]
        else:
            index = self.args["options"]["short"]["-i"] or self.args["options"]["long"]["--index"]
            if index is None:
                self.error_signal.emit("Error: Please specify either the index or id of the reminder.\n")
                return -1
            try:
                index = int(index[0])
                reminder_id = tree.reminder_service.list_reminders()[index].reminder_id
            except IndexError:
                self.error_signal.emit("Error: No such reminder.\n")
                return -1
            except ValueError:
                self.error_signal.emit("Error: Invalid index.\n")
                return -1
        new_message = self.args["options"]["short"]["-m"] or self.args["options"]["long"]["--message"]
        new_due_time_format = self.args["options"]["short"]["-t"] or self.args["options"]["long"]["--time"]
        new_active = self.args["options"]["short"]["-a"] or self.args["options"]["long"]["--active"]

        if new_message is not None:
            new_message = new_message[0]
        if new_active is not None:
            if new_active[0] not in ["0", "1"]:
                self.error_signal.emit("Error: Invalid active value. Please use 0 or 1.\n")
                return -1
            new_active = bool(int(new_active[0]))

        if new_due_time_format is not None:
            new_due_time_format = new_due_time_format[0]
            try:
                new_due_time = time_parser(new_due_time_format)
            except ValueError as e:
                self.error_signal.emit(f"Error: {str(e)}\n")
                return -1
        else:
            new_due_time = None
        res = tree.set_reminder(reminder_id, new_due_time, new_message, new_active)
        if res == -1:
            self.error_signal.emit("Error: No such reminder.\n")
        
        return 0

    @override
    def auto_complete(self, tree):
        return None, []
