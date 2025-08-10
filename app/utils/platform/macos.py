from AppKit import NSApp, NSApplicationActivationPolicyRegular, NSApplicationActivationPolicyAccessory, NSApplicationActivationPolicyProhibited # type: ignore

def set_app_state(active):
    return 1
    if not NSApp:
        return
    try:
        if active:
            NSApp.activateIgnoringOtherApps_(True)
            NSApp.setActivationPolicy_(NSApplicationActivationPolicyRegular)
        else:
            NSApp.setActivationPolicy_(NSApplicationActivationPolicyAccessory)
    except Exception as e:
        raise RuntimeError("Failed to set app state.")


from pynput import keyboard
import string
def qkeysequence_to_pynput(qt_str: str) -> str | None:
    """
    transform strings given by QKeySequence.toString() to strings that pynput parses.
    e.g. "Ctrl+Shift+S" -> "<ctrl>+<shift>+s"
    """
    if qt_str == "":
        return None
    
    # map PyQt keys to pynput keys
    modifier_map = {
        'ctrl':   keyboard.Key.cmd,
        'shift':  keyboard.Key.shift,
        'alt':    keyboard.Key.alt,
        'meta':   keyboard.Key.ctrl,
    }

    special_key_map = {
        'esc':       keyboard.Key.esc,
        'tab':       keyboard.Key.tab,
        'backspace': keyboard.Key.backspace,
        'return':    keyboard.Key.enter,
        'enter':     keyboard.Key.enter,
        'space':     keyboard.Key.space,
        'delete':    keyboard.Key.delete,
        'home':      keyboard.Key.home,
        'end':       keyboard.Key.end,
        'pageup':    keyboard.Key.page_up,
        'pagedown':  keyboard.Key.page_down,
        'up':        keyboard.Key.up,
        'down':      keyboard.Key.down,
        'left':      keyboard.Key.left,
        'right':     keyboard.Key.right,
    }
    # f1-f12
    for i in range(1, 21):
        special_key_map[f'f{i}'] = getattr(keyboard.Key, f'f{i}')

    pynput_parts = []

    keys = [key.strip().lower() for key in qt_str.split('+')]
    
    for key in keys:
        if key in modifier_map:
            pynput_parts.append(f"<{modifier_map[key].name}>")
        elif key in special_key_map:
            pynput_parts.append(f"<{special_key_map[key].name}>")
        else:
            # simple character key
            if not key in string.ascii_letters and not key in string.digits:
                raise ValueError(f"Unable to parse key '{key}'")
            pynput_parts.append(key)
            
    return "+".join(pynput_parts)


class Notification:
    pass