from typing import Optional, Callable
import logging, sys, asyncio

logger = logging.getLogger(__name__)

def set_app_state(active):
    return

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
        'ctrl':   keyboard.Key.ctrl,
        'shift':  keyboard.Key.shift,
        'alt':    keyboard.Key.alt,
        'meta':   keyboard.Key.cmd,
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


def app_initialization(app):
    pass

class Notification:

    def __init__(self, callback: Optional[Callable] = None):
        """

        init a notification manager with a callback.

        signature of the callback:
        :param1: action_id, literally the identifier of the button which the user clicked
        :param2: user_info, the data which you passed when sending the notification
        :param3: user_text, the input of the user if a input action is used
        :return: None

        """
        self.callback = callback
        self.category : Optional[str] = None
        self.actions = list[dict[str, str]]
        self.xml_text = ''
        self.input_xml = ''
        self.action_xml = ''
    
    def request_authorization_if_needed(self):
        return
    
    def add_category(self, category_id: str, actions: list[dict[str, str]]):
        """
        register a category of notification.
        you can choose a registered category afterwards when sending a notification.

        :param category_id: the unique identifier of the category. use this to identify a category when sending a notification.
        :param actions: a list of actions of the category

        actions: List[dict["id": str, "title": str, "type": str]]
        every dict symbolizes an action.
        """
        self.category = category_id
        self.actions = actions

        # make xml
        for action_info in actions:
            if action_info['type'] == "text":
                self.input_xml += f'<input id="{action_info['id']}" type="text" placeHolderContent="enter {action_info['title']}" />'
                self.action_xml += f'<action content="{action_info["title"]}" arguments="__text:{action_info['id']}" activationType="foreground" />'
            else:
                self.action_xml = f'<action content="{action_info["title"]}" arguments="__action:{action_info['id']}" activationType="foreground" />' + self.action_xml            

    def send_notification(self, title, body, 
                          identifier: Optional[str] = None,
                          category_id: Optional[str] = None,
                          user_info: Optional[dict] = None) -> None:
        """
        send a notification.
        :param title: title of notification
        :param body: body of notification
        :param identifier: unique identifier of the notification, used to update or remove a notification
        :param category_id: the category registered with add_category. default to be simple notification(only title and body)
        :param user_info: customized data, and receive it later in the callback.
        :return: None
        """
        try:
            from winsdk.windows.ui.notifications import ToastNotificationManager, ToastNotification, ToastActivatedEventArgs
            from winsdk.windows.data.xml.dom import XmlDocument
            from winsdk.windows.foundation import IPropertyValue

        except ImportError:
            logger.debug('Package Not Found: winsdk')
            return
        
        if self.input_xml == '' and self.action_xml == '':
            logger.debug('Before send a notification, you need to add a category.')
        
        xml_str = f"""
        <toast scenario="{self.category}">
            <visual>
                <binding template="ToastGeneric">
                    <text>{title}</text>
                    <text>{body}</text>
                </binding>
            </visual>
            <actions>
                {self.input_xml}
                {self.action_xml}
            </actions>
        </toast>
        """
        xml = XmlDocument()
        xml.load_xml(xml_str)
        notifier = ToastNotificationManager.create_toast_notifier(sys.executable)
        notification = ToastNotification(xml)

        def activated(sender, args_obj):
            result_value = ''
            action_id = ''
            try:
                args = ToastActivatedEventArgs._from(args_obj).arguments
                if args.startswith("__action:"):
                    action_id = args[len("__action:"):]
                elif args.startswith("__text"):
                    user_inputs = ToastActivatedEventArgs._from(args_obj).user_input
                    action_id = args[len('__text:'):]
                    result_value = IPropertyValue._from(user_inputs[action_id]).get_string()
            except Exception as e:
                logger.error(f"Error processing activation: {e}")
                return
            self.callback(action_id, user_info, result_value)
        
        notification.add_activated(activated)
        notifier.show(notification)

# if __name__ == '__main__':
#     def f(action_id, user_info, user_text):
#         print(action_id, user_info, user_text)

#     n = Notification(f)
#     n.add_category('test', [
#             {"id": 'ID-1111', "title": "delay", "type": "text"},
#             {"id": 'ID-3333', "title": "dd222", "type": "text"},
#             {"id": 'ID-2222', "title": "complete", "type": ""},
#         ])
#     n.send_notification('title', 'body')
#     _ = input()
