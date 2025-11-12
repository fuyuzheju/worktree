from PyQt5.QtCore import Qt, pyqtSignal, QObject, QTimer
from pynput import keyboard
from app.UI.main_window import MainWindow
from app.globals import context
import logging
from app.utils import qkeysequence_to_pynput


class HotkeyManager(QObject):
    hotkeyPressed = pyqtSignal()
    def __init__(self,
                 connected_window: MainWindow,
                 key_name: str = "hotkey/mainWindowHotkey",):
        """
        :param key_name: the key name of the hotkey to listen in the settings
        :param connected_window: the window to connect to the hotkey
        """
        super().__init__()
        self.key_name = key_name
        self.connected_window = connected_window
        self.hotkeyPressed.connect(connected_window.toggle_state)

        self.logger = logging.getLogger(__name__)

        context.settings_manager.settings_changed.connect(self.update_settings)
        self.global_listen()

        self.check_timer = QTimer(self)
        self.check_timer.setInterval(5000)
        self.check_timer.timeout.connect(self.check_and_restart)
        self.check_timer.start()
    
    def update_settings(self, keys):
        if not "hotkey/mainWindowHotkey" in keys:
            return
        if not self.global_hotkey_listener:
            return 
        self.check_timer.stop()
        self.global_hotkey_listener.stop()
        self.global_hotkey_listener.join()
        self.global_listen()
        self.check_timer.start()

    def global_listen(self):
        """
        start listening
        """
        def on_press():
            self.logger.debug(f"Hotkey Pressed.")
            self.hotkeyPressed.emit()

        key_sequence = context.settings_manager.get(self.key_name, type=str) # get a PyQt key sequence string here
        hotkey = qkeysequence_to_pynput(key_sequence) # transform it into something that pynput can parse
        assert hotkey is not None
        hotkeys_config = {
            hotkey: on_press
        }
        if hotkey is not None:
            self.global_hotkey_listener = keyboard.GlobalHotKeys(hotkeys_config, on_error=lambda e:self.logger.error("Global Hotkey error: {e}"))
            self.global_hotkey_listener.start()
            self.logger.debug(f"Started listening for hotkey: {hotkey}.")
        else:
            self.global_hotkey_listener = None
            self.logger.warning('Global hotkey listener was not created due to empty hotkey settings.')
    
    def check_and_restart(self):
        if self.global_hotkey_listener:
            if not self.global_hotkey_listener.running:
                self.logger.warning("Global hotkey listener is not running, trying to restart.")
                self.global_hotkey_listener.start()
            if not self.global_hotkey_listener.is_alive():
                self.logger.warning("Global hotkey listener thread is not alive, trying to recreate.")
                self.global_listen()
    
    def cleanup(self):
        if not self.global_hotkey_listener:
            return
        self.global_hotkey_listener.stop()
        self.global_hotkey_listener.join()
        self.check_timer.stop()
