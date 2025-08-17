from PyQt5.QtCore import QSettings, Qt, pyqtSignal, QObject
from PyQt5.QtGui import QColor, QKeySequence
import logging

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "createTrayIcon": True, 
    "showReminderHint": True,
    "displayReminderNotification" : True,

    "hotkey/mainWindowHotkey": QKeySequence(Qt.CTRL + Qt.Key_B).toString(),
    "hotkey/saveFileHotkey": QKeySequence(Qt.CTRL + Qt.Key_S).toString(), 
    "hotkey/openFileHotkey": QKeySequence(Qt.CTRL + Qt.Key_O).toString(),
    
    "graph/minNodeWidth": 80,
    "graph/minNodeHeight": 18,
    "graph/nodeHSpacing": 25,
    "graph/nodeVSpacing": 15,
    "graph/fontSize": 10,
    "graph/fontFamily": "Arial",
    "graph/completedColor": QColor("#c8e6c9"),
    "graph/currentColor": QColor("#bbdefb"),
    "graph/waitingColor": QColor("#fff9c4"),
    "graph/rectColor": QColor(Qt.black),
    "graph/lineColor": QColor(Qt.gray),
    "graph/textColor": QColor(Qt.black),
    "graph/rectPenWidth": 2,
    "graph/linePenWidth": 3,
    "graph/textPenWidth": 1,
    "graph/reminderDotSize": 12,
    "graph/reminderDotSpacing": 2,
    "graph/reminderDotOffset": 6,
    "graph/activeReminderDotColor": QColor(Qt.red),
    "graph/inactiveReminderDotColor": QColor(Qt.blue),
}

class SettingsManager(QObject):
    settings_changed = pyqtSignal(list)
    def __init__(self):
        super().__init__()
        self.settings = QSettings()
        logger.debug(f"SettingsManager initialized. File: {self.settings.fileName()}")

    def get(self, key, type=None):
        if type is None:
            value = self.settings.value(key, DEFAULT_SETTINGS[key])
        else:
            value = self.settings.value(key, DEFAULT_SETTINGS[key], type=type)
        return value

    def set(self, keys: list, values: list):
        if len(keys) != len(values):
            raise ValueError("keys and values must have the same length")
        for key, value in zip(keys, values):
            self.settings.setValue(key, value)
        self.settings_changed.emit(keys)

    def recover_default(self):
        # recover all settings to default by remove the storage
        self.settings.clear()
        self.settings_changed.emit(list(DEFAULT_SETTINGS.keys()))


settings_manager = SettingsManager()
