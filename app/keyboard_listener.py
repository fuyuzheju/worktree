from PyQt5.QtCore import Qt, pyqtSignal, QObject, QTimer
from pynput import keyboard
import logging

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
        logging.info("Hotkey manager created.")

    def global_listen(self):
        def on_press():
            logging.info("Hotkey Pressed.")
            self.hotkeyPressed.emit()
        
        hotkeys_config = {
            self.hotkey: on_press
        }
        self.global_hotkey_listener = keyboard.GlobalHotKeys(hotkeys_config, on_error=lambda e:logging.error("Global Hotkey error: {e}"))
        self.global_hotkey_listener.start()
    
    def check_and_restart(self):
        if not self.global_hotkey_listener:
            logging.warning("Warning: Global hotkey listener is None.")
        
        if not self.global_hotkey_listener.running:
            logging.warning("Global hotkey listener is not running, trying to restart.")
            self.global_hotkey_listener.start()
        
        if not self.global_hotkey_listener.is_alive():
            logging.warning("Global hotkey listener thread is not alive, trying to recreate.")
            self.global_listen()
    
    def cleanup(self):
        self.global_hotkey_listener.stop()
        self.global_hotkey_listener.join()
        self.check_timer.stop()

# def global_listen(hotkey, connected_window):
#     hotkey_emitter = HotkeyEmitter()
#     hotkey_emitter.hotkeyPressed.connect(connected_window.toggle_state, Qt.QueuedConnection)

#     global_hotkey_listener = None
#     try:
#         hotkeys_config = {
#             hotkey: hotkey_emitter.hotkeyPressed.emit
#         }
#         global_hotkey_listener = keyboard.GlobalHotKeys(hotkeys_config, on_error=lambda e: print(f"Global hotkey error: {e}"))
#         global_hotkey_listener.start()
#         print(f"Global hotkey listener started, listening {hotkey}.")

#     except Exception as e:
#         print(f"Failed to start global hotkey listening: {e}")

#     return global_hotkey_listener, hotkey_emitter

# def check_and_restart(listener):
#     if not listener:
#         print("Warning: Global hotkey listener is None.")
#         return

#     if not listener.running:
#         print("Global hotkey listener is not running, trying to restart.")
#         listener.start()
#         return listener

#     if not listener.is_alive():
#         print("Global hotkey listener thread is not alive, trying to recreate.")
#         config = listener._config
#         listener.stop()
#         listener.join()
#         global_hotkey_listener = keyboard.GlobalHotKeys(config)
#         global_hotkey_listener.start()
#         print(f"Global hotkey listener started, listening {hotkey}.")
#         return listener
