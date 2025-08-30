from .command_bases import CommandGroup, Subcommand
from .utils import time_parser
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
    
    @override
    def command_arguments_numbers(self):
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
    def execute(self, context, shell):
        if self.args['options']['short']['-l'] is not None or self.args['options']['long']['--long'] is not None:
            def format_reminder(reminder, index):
                return f"[{index}]   {reminder.message}     {reminder.node_id}     {reminder.due_time.isoformat()}     {reminder.active}     {reminder.reminder_id}\n"
        else:
            def format_reminder(reminder, index):
                return f"[{index}]   {reminder.message}     {reminder.due_time}\n"

        if self.args['options']['short']['-a'] is not None or self.args['options']['long']['--all'] is not None:
            for index, reminder in enumerate(context.work_tree.list_reminders()):
                self.output_signal.emit(format_reminder(reminder, index))
        
        else:
            for index, reminder in enumerate(context.work_tree.list_reminders()):
                if reminder.active:
                    self.output_signal.emit(format_reminder(reminder, index))
        return 0
    
    @override
    def auto_complete(self, context, shell):
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
    
    @override
    def command_arguments_numbers(self):
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
    def execute(self, context, shell):
        node_path = self.args["arguments"]["required"][0]
        due_time_format = self.args["arguments"]["required"][1]

        node = shell.path_parser(node_path)
        if node is None:
            self.error_signal.emit(f"Error: No such node {node_path}.\n")
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
            
        context.work_tree.add_reminder(node.identity, due_time, message, str(uuid.uuid4()))
        return 0
    
    @override
    def auto_complete(self, context, shell):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][-1]
            return shell.path_completor(incomplete_path)
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
    
    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 1, # reminder specifier
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {},
            }
        }
    
    @override
    def execute(self, context, shell):
        specifier = self.args["arguments"]["required"][0]
        try:
            # index specifying
            index = int(specifier)
            reminder_id = context.work_tree.list_reminders()[index].reminder_id
        except (IndexError, ValueError):
            # id specifying
            reminder_id = specifier

        res = context.work_tree.remove_reminder(reminder_id)
        if res == -1:
            self.error_signal.emit(f"Error: No such reminder '{reminder_id}'.\n")
            return -1
        self.output_signal.emit("Reminder removed.\n")
        return 0
    
    @override
    def auto_complete(self, context, shell):
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
    
    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 1, # reminder specifier
                "optional": 0,
            },
            "options": {
                "short": {"-m": 1, "-t": 1, "-a": 1},
                "long": {"--message": 1, "--time": 1, "--active": 1},
            }
        }
    
    @override
    def execute(self, context, shell):
        specifier = self.args["arguments"]["required"][0]
        try:
            # index specifying
            index = int(specifier)
            reminder_id = context.work_tree.list_reminders()[index].reminder_id
        except (IndexError, ValueError):
            # id specifying
            reminder_id = specifier

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
        res = context.work_tree.set_reminder(reminder_id, new_due_time, new_message, new_active)
        if res == -1:
            self.error_signal.emit(f"Error: No such reminder '{reminder_id}'.\n")
        
        return 0

    @override
    def auto_complete(self, tree, shell):
        return None, []
