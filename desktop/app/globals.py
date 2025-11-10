# this module provides a global context of the whole app
# every part of the app can import this module to access some context

from .settings import SettingsManager

class AppContext:
    def __init__(self):
        self.settings_manager = SettingsManager()

context = AppContext()
