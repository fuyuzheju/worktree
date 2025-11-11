import importlib
import pkgutil
import logging

logger = logging.getLogger(__name__)

for module_info in pkgutil.iter_modules([__path__[0]+"/instances"]):
    module_name = module_info.name
    if module_name.endswith("command"):
        importlib.import_module(f".instances.{module_name}", package=__package__)
        logger.debug(f"import {module_name}")

from .command_bases import COMMAND_REGISTRY # export
