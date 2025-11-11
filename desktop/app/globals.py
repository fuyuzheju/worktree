# this module provides a global context of the whole app
# every part of the app can import this module to access some context

from __future__ import annotations
from .settings import SettingsManager

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app import Application

class AppContext:
    def __init__(self):
        self.settings_manager = SettingsManager()
        self.current_app = None
    
    def register_app(self, app: Application):
        self.current_app = app

context = AppContext()

