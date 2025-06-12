from PyQt5.QtCore import Qt, pyqtSignal, QObject
from pynput import keyboard

class HotkeyEmitter(QObject):
    hotkeyPressed = pyqtSignal()

def global_listen(hotkey, connected_window):
    hotkey_emitter = HotkeyEmitter()
    hotkey_emitter.hotkeyPressed.connect(connected_window.toggle_state, Qt.QueuedConnection)

    global_hotkey_listener = None
    try:
        hotkeys_config = {
            hotkey: hotkey_emitter.hotkeyPressed.emit
        }
        global_hotkey_listener = keyboard.GlobalHotKeys(hotkeys_config)
        global_hotkey_listener.start()
        print(f"Global hotkey listener started, listening {hotkey}.")

    except Exception as e:
        print(f"Failed to start global hotkey listening: {e}")

    return global_hotkey_listener, hotkey_emitter
