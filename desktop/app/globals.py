# this module provides a global context of the whole app
# every part of the app can import this module to access some context

from __future__ import annotations
from .settings import SettingsManager

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app import Application

class AppContext:
    def __init__(self):
        self.settings_manager: SettingsManager = None # type: ignore
        self.current_app: Application = None # type: ignore
    
    def setup(self, app: Application):
        self.settings_manager = SettingsManager()
        self.current_app = app

context = AppContext()

