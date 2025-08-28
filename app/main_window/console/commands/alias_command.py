from .command_bases import Command
from typing import override
import copy

class AliasCommand(Command):
    @classmethod
    @override
    def command_str(cls):
        return "alias"

    @classmethod
    @override
    def command_help(cls):
        return "create another name for a specific command." \
            "Usage: alias <name> <command>"

    @override
    def command_arguments_numbers(self):
        return {
            "arguments": {
                "required": 2, # name, command
                "optional": 1024,
            },
            "options": {
                "short": {},
                "long": {}
            }
        }

    @override
    def execute(self, work_tree, shell):
        from .command_bases import COMMAND_REGISTRY
        alias_name = self.args["arguments"]["required"][0]
        alias_content = self.args["arguments"]["required"][1:] + self.args["arguments"]["optional"]
        if alias_name in COMMAND_REGISTRY:
            self.error_signal.emit("Error: Alias name already exists.\n")
            return -1
        proxy = proxy_factory(alias_name=alias_name, alias_content=alias_content) # automatically registered to COMMAND_REGISTRY
        self.output_signal.emit("success\n")
    
    @override
    def auto_complete(self, work_tree, shell):
        return None, []


def proxy_factory(alias_name: str,
                  alias_content: list[str],
                  alias_help: str = "") -> type: # argument "alias_help" is usually for built-in aliases

    from .command_bases import COMMAND_REGISTRY

    class AliasProxy(Command):

        """
        Just like class CommandGroup in terms of implementing ideas,
        behaveing as a proxy for another command, with all the methods mapped to the original command.
        Dynamically analyse the alias content while being executed,
        so that you can use alias commands literally the same as original ones.
        """

        _alias_name = alias_name
        _alias_content = alias_content

        @classmethod
        @override
        def command_str(cls):
            return alias_name
        
        @classmethod
        @override
        def command_help(cls):
            return alias_help

        @override
        def command_arguments_numbers(self):
            original_class = COMMAND_REGISTRY.get(self._alias_content[0])
            if original_class is None:
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

            else:
                original_instance = original_class(*(self._alias_content[1:]))
                if original_instance.status == 2: # too many arguments
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
                
                else:
                    def ext_len(obj):
                        if obj is None:
                            return 0
                        return len(obj)

                    original_ca_num = original_instance.command_arguments_numbers()
                    retval =  {
                        "arguments": {
                            "required": original_ca_num["arguments"]["required"] - ext_len(original_instance.args["arguments"]["required"]),
                            "optional": original_ca_num["arguments"]["optional"] - ext_len(original_instance.args["arguments"]["optional"]),
                        },
                        "options": {
                            "short": {
                                kw: original_ca_num["options"]["short"][kw] - ext_len(original_instance.args["options"]["short"][kw])
                                    for kw in original_ca_num["options"]["short"]
                            },
                            "long": {
                                kw: original_ca_num["options"]["long"][kw] - ext_len(original_instance.args["options"]["long"][kw])
                                    for kw in original_ca_num["options"]["long"]
                            },
                        }
                    }
                    return retval
        
        @override
        def parse_parts(self):
            original_class = COMMAND_REGISTRY.get(self._alias_content[0])
            if original_class is None:
                return 1

            original_instance = original_class(*(self._alias_content[1:] + self.parts))
            self.args = copy.deepcopy(original_instance.args)
            self.last_arg = original_instance.last_arg
            return original_instance.status
        
        @override
        def execute(self, work_tree, shell):
            original_class = COMMAND_REGISTRY.get(self._alias_content[0])
            original_instance = original_class(*(self._alias_content[1:] + self.parts))
            original_instance.output_signal.connect(self.output_signal)
            original_instance.error_signal.connect(self.error_signal)
            original_instance.finish_signal.connect(self.finish_signal)
            return original_instance.execute(work_tree, shell)

        @override
        def auto_complete(self, work_tree, shell):
            original_class = COMMAND_REGISTRY.get(self._alias_content[0])
            if original_class is None:
                return None, []
            original_instance = original_class(*(self._alias_content[1:] + self.parts))
            return original_instance.auto_complete(work_tree, shell)
            