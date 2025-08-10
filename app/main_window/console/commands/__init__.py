import importlib
from pathlib import Path

file_list = Path(__file__).parent.glob("*.py")
for file in file_list:
    if file.name.endswith("command.py"):
        importlib.import_module(f".{file.stem}", package=__package__)
        print(f"import {file.stem}")

from .command_bases import COMMAND_REGISTRY # export
