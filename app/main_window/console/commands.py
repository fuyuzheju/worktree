from typing import override
from .utils import path_parser, path_completor, max_common_prefix, time_parser
from .command_bases import Command, CommandGroup, Subcommand
import uuid

from ...data.tree import Node

# clarifications:
# short options are with one dash, while long options are with two dashes
# if an short option does the same thing as a long option, the short option will be prioritized
# e.g.
# -m "message1" --message "message2" 
# the message will finally be set to "message1"




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


class ReopenCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "reopen"
    
    @classmethod
    @override
    def command_help(cls):
        return "reopen the completed node.\n" \
            "Usage: reopen <path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1, # node_path
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        path = self.args["arguments"]["required"][0]
        node = path_parser(path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        res = tree.reopen_node(node.identity)
        if res == -1:
            self.error_signal.emit("Error: Node is not completed.\n")
            return -1        
        self.output_signal.emit("Node reopened successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []

class CheckReadyCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "ck"
    
    @classmethod
    @override
    def command_help(cls):
        return "check whether if the current node is ready.\n" \
            "Usage: ck [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0,
                "optional": 1, # node_path
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        if self.args['arguments']['optional']:
            node = path_parser(self.args['arguments']['optional'][0], tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.current_node
        self.output_signal.emit("Current node is_ready: " + str(node.is_ready()) + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'optional'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["optional"][0]
            return path_completor(incomplete_path, tree)
        return None, []


class SwitchCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "cd"
    
    @classmethod
    @override
    def command_help(cls):
        return "change current node.\n" \
            "Usage: cd <path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1, # node_path
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        path = self.args["arguments"]["required"][0]
        target = path_parser(path, tree)
        if target is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        res = tree.switch_to(target.identity)
        if res == -1:
            self.error_signal.emit("Error: Node completed already.\n")
            return -1
        self.output_signal.emit("Switched to node " + target.name + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []


class AddNodeCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "add"
    
    @classmethod
    @override
    def command_help(cls):
        return "add a node as a child of the current node.\n" \
            "Usage: add <node_name>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1, # node_name
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, tree):
        name = self.args["arguments"]["required"][0]
        if '.' in name or '/' in name or ':' in name or name == '':
            self.error_signal.emit("Error: Invalid node name.\n")
            return 1
        # search for node
        current_node = tree.tree.current_node
        for child in current_node.children:
            if child.name == name:
                self.error_signal.emit("Error: Node already exists.\n")
                return -1

        new_node = tree.add_node(current_node.identity, name, str(uuid.uuid4()))

        # switch to the new node
        self.output_signal.emit("Node added successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree):
        return None, []


class ListCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "ls"
    
    @classmethod
    @override
    def command_help(cls):
        return "list the children of the current node.\n" \
            "Usage: ls [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0,
                "optional": 1, # node_path
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]   
            node = path_parser(path, tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.tree.current_node
        self.output_signal.emit("Children of node " + node.name + ":\n")
        for child in node.children:
            self.output_signal.emit(child.name + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'optional'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["optional"][0]
            return path_completor(incomplete_path, tree)
        return None, []


class TreeCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "tree"
    
    @classmethod
    @override
    def command_help(cls):
        return "view the tree structure.\n" \
            "Usage: tree [path]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0,
                "optional": 1, # node_path
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        if self.args["arguments"]["optional"]:
            path = self.args["arguments"]["optional"][0]
            node = path_parser(path, tree)
            if node is None:
                self.error_signal.emit("Error: No such node.\n")
                return -1
        else:
            node = tree.tree.current_node
        self.output_signal.emit("Tree structure:\n")
        def print_tree(prefix: str, node: Node, is_last=True):
            self.output_signal.emit(prefix + ('└── ' if is_last else '├── ') + node.name + '\n')
            child_count = len(node.children)
            for idx, child in enumerate(node.children):
                is_child_last = (idx == child_count - 1)
                new_prefix = prefix + ('    ' if is_last else '│   ')
                print_tree(new_prefix, child, is_child_last)
        print_tree('', node, True)
        return 0
    
    @override
    def auto_complete(self, tree):
        if len(self.args["arguments"]["optional"]) != 1:
            return None, []
        incomplete_path = self.args["arguments"]["optional"][0]
        return path_completor(incomplete_path, tree)


class RemoveCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "rm"
    
    @classmethod
    @override
    def command_help(cls):
        return "remove a leaf node or a subtree.\n" \
            "Usage: rm <path> [-r]"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 1, # node_path
                "optional": 0,
            },
            "options": {
                "short": {
                    "-r": 0,
                },
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        path = self.args["arguments"]["required"][0]
        target = path_parser(path, tree)
        if target is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1

        if self.args["options"]["short"]["-r"] is None:
            st = tree.remove_node(target.identity)
        else:
            st = tree.remove_subtree(target.identity)
        if st != 0:
            self.error_signal.emit("Error: Failed to remove node.\n")
            return -1

        self.output_signal.emit("Node removed successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []


class MoveCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "mv"

    @classmethod
    @override
    def command_help(cls):
        return "move a node(subtree) to a new path.\n" \
            "Usage: mv <node_path> <new_parent_path>"
    
    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 2, # node_path, new_parent_path
                "optional": 0,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        node_path = self.args["arguments"]["required"][0]
        new_parent_path = self.args["arguments"]["required"][1]
        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit(f"Error: No such node {node_path}.\n")
            return -1
        new_parent = path_parser(new_parent_path, tree)
        if new_parent is None:
            self.error_signal.emit(f"Error: No such node {new_parent_path}.\n")
            return -1
        res = tree.move_node(node.identity, new_parent.identity)
        if res == -1:
            self.error_signal.emit("Failed to move node.\n")
            return -1
        self.output_signal.emit("Node moved successfully.\n")
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and (self.last_arg[1] == 0 or self.last_arg[1] == 1):
            incomplete_path = self.args["arguments"]["required"][-1]
            return path_completor(incomplete_path, tree)
        return None, []


class CheckStateCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "st"
    
    @classmethod
    @override
    def command_help(cls):
        return "view the state of a node.\n" \
            "Usage: st <node_path>"

    @override
    def execute(self, tree):
        node_path = self.args["arguments"]["required"][0]
        node = path_parser(node_path, tree)
        if node is None:
            self.error_signal.emit("Error: No such node.\n")
            return -1
        self.output_signal.emit("Node state: " + str(node.status) + '\n')
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'required'] and self.last_arg[1] == 0:
            incomplete_path = self.args["arguments"]["required"][0]
            return path_completor(incomplete_path, tree)
        return None, []


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
        tree.undo()
        return 0
    
    @override
    def auto_complete(self, tree):
        return None, []


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
        from ...controls import quit_signal
        quit_signal.emit()
    
    @override
    def auto_complete(self, tree):
        return None, []


class HelpCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "help"
    
    @classmethod
    @override
    def command_help(cls):
        return "view this help message.\n" \
            "Usage: help [command...]"

    @classmethod
    @override
    def command_arguments_numbers(cls):
        return {
            "arguments": {
                "required": 0,
                "optional": float('inf'), # command_list
            },
            "options": {
                "short": {},
                "long": {}
            }
        }
    
    @override
    def execute(self, tree):
        if not self.args["arguments"]["optional"]:
            command_list = COMMAND_REGISTRY.keys()
        else:
            command_list = self.args["arguments"]["optional"]
        for command in command_list:
            if command in COMMAND_REGISTRY:
                self.output_signal.emit("- " + command + "\n" + COMMAND_REGISTRY[command].command_help() + "\n\n")
            else:
                self.error_signal.emit(f"Error: No such command {command}.\n")
                return -1
        
        return 0
    
    @override
    def auto_complete(self, tree):
        if self.last_arg[0] == ['arguments', 'optional']:
            incomplete_command = self.args["arguments"]["optional"][-1]
            possible_completion_list = [command for command in COMMAND_REGISTRY.keys()
                    if command.startswith(incomplete_command)]
            mcp = max_common_prefix(possible_completion_list)
            return mcp, possible_completion_list
        return None, []


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

        # TODO: NOT IMPLEMENTED!!! AND THE ABOVE CODE MAY NOT CORRECT AS WELL!!!

    @override
    def auto_complete(self, tree):
        return None, []

# at the end of this file, COMMAND_REGISTRY has been automatically initialized,
# through the __init_subclass__ method of Command class.