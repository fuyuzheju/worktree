from PyQt5.QtCore import Qt, pyqtSignal, QObject, QTimer
from pynput import keyboard
import logging

logger = logging.getLogger(__name__)

class HotkeyManager(QObject):
    hotkeyPressed = pyqtSignal()
    def __init__(self, hotkey, connected_window):
        super().__init__()
        self.hotkey = hotkey
        self.connected_window = connected_window
        self.hotkeyPressed.connect(connected_window.toggle_state, Qt.QueuedConnection)
        self.global_listen()

        self.check_timer = QTimer(self)
        self.check_timer.setInterval(5000)
        self.check_timer.timeout.connect(self.check_and_restart)
        self.check_timer.start()
        logger.info("Hotkey manager created.")

    def global_listen(self):
        def on_press():
            logger.info(f"Hotkey Pressed.")
            self.hotkeyPressed.emit()

        hotkeys_config = {
            self.hotkey: on_press
        }
        self.global_hotkey_listener = keyboard.GlobalHotKeys(hotkeys_config, on_error=lambda e:logger.error("Global Hotkey error: {e}"))
        self.global_hotkey_listener.start()
    
    def check_and_restart(self):
        if not self.global_hotkey_listener:
            logger.warning("Warning: Global hotkey listener is None.")
        
        if not self.global_hotkey_listener.running:
            logger.warning("Global hotkey listener is not running, trying to restart.")
            self.global_hotkey_listener.start()
        
        if not self.global_hotkey_listener.is_alive():
            logger.warning("Global hotkey listener thread is not alive, trying to recreate.")
            self.global_listen()
    
    def cleanup(self):
        self.global_hotkey_listener.stop()
        self.global_hotkey_listener.join()
        self.check_timer.stop()
