from PyQt5.QtCore import QSettings, Qt, pyqtSignal, QObject
from PyQt5.QtGui import QColor, QKeySequence
import logging

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS = {
    "hotkey/mainWindowHotkey": QKeySequence(Qt.CTRL + Qt.Key_F).toString(),
    
    "graph/nodeWidth": 80,
    "graph/nodeHeight": 18,
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
    "graph/rectPenWidth": 1.5,
    "graph/linePenWidth": 2,
    "graph/textPenWidth": 1,
}

class SettingsManager(QObject):
    settings_changed = pyqtSignal(list)
    def __init__(self):
        super().__init__()
        self.settings = QSettings()
        logger.info(f"SettingsManager initialized. File: {self.settings.fileName()}")

    def get(self, key, type=None):
        if type is None:
            value = self.settings.value(key, DEFAULT_SETTINGS[key])
        else:
            value = self.settings.value(key, DEFAULT_SETTINGS[key], type=type)
        return value

    def set(self, keys: list[str], values: list):
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
