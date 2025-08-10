import sys
import importlib
from typing import Any, Optional
from types import ModuleType

_platform_module: Optional[ModuleType] = None


def _get_platform_module() -> ModuleType:
    """
    Detects the platform and imports the corresponding implementation module.
    Caches the module to avoid repeated imports.
    """
    global _platform_module
    if _platform_module:
        return _platform_module

    if sys.platform == 'win32':
        platform_name = 'windows'
    elif sys.platform == 'darwin':
        platform_name = 'macos'
    elif sys.platform == 'linux' or sys.platform == 'linux2':
        # Assuming other platforms are linux-based
        platform_name = 'linux'
    else:
        raise RuntimeError(f"Unsupported platform: {sys.platform}")

    try:
        module_path = f'.platform.{platform_name}'
        _platform_module = importlib.import_module(module_path, package=__package__)
        return _platform_module
    except ImportError as e:
        raise ImportError(
            f"Could not import platform-specific module for '{platform_name}'. "
            f"Ensure the file 'app/utils/platform/{platform_name}.py' exists."
        ) from e


class Proxy:
    """
    A proxy object that lazily loads an attribute (function or class)
    from a platform-specific module.
    """
    def __init__(self, name: str):
        self._name = name
        self._resolved_obj: Any = None

    def _resolve(self) -> Any:
        """
        Resolves and returns the actual object from the platform module.
        The result is cached for subsequent accesses.
        """
        if self._resolved_obj is None:
            platform_module = _get_platform_module()
            try:
                self._resolved_obj = getattr(platform_module, self._name)
            except AttributeError as e:
                raise AttributeError(
                    f"'{self._name}' not found in platform module "
                    f"'{platform_module.__name__}'."
                ) from e
        return self._resolved_obj

    def __call__(self, *args, **kwargs) -> Any:
        """
        Makes the proxy instance callable, forwarding the call to the real object.
        This is used for proxied functions and class instantiation.
        """
        return self._resolve()(*args, **kwargs)

    def __getattr__(self, name: str) -> Any:
        """
        Forwards attribute access to the real object.
        This is used for accessing class methods/attributes on a proxied class.
        """
        return getattr(self._resolve(), name)