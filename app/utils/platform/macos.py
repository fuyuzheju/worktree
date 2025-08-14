from AppKit import NSApp, NSApplicationActivationPolicyRegular, NSApplicationActivationPolicyAccessory, NSApplicationActivationPolicyProhibited # type: ignore

def set_app_state(active):
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


def app_initialization(app):
    pass


import UserNotifications as UN
from Foundation import NSObject, NSDictionary
import uuid

# assistant class to manage notifications interacting with the apis of the system
# call a callback when the notification is triggered
class _NotificationDelegate(NSObject):
    def initWithCallback_(self, callback):
        self = self.init()
        if self is None: return None
        self.callback_handler = callback
        return self

    # call this when the app is at frontend
    def userNotificationCenter_willPresentNotification_withCompletionHandler_(self, center, notification, completionHandler):
        completionHandler(UN.UNNotificationPresentationOptionAlert | UN.UNNotificationPresentationOptionSound)

    # call this when the user interacted with the notification
    def userNotificationCenter_didReceiveNotificationResponse_withCompletionHandler_(self, center, response, completionHandler):
        if self.callback_handler:
            action_id = response.actionIdentifier()
            
            user_info = response.notification().request().content().userInfo()

            user_text = None
            if response.isKindOfClass_(UN.UNTextInputNotificationResponse):
                user_text = response.userText()
            
            self.callback_handler(action_id, user_info, user_text)
        
        # call completion to mark the finish of processing
        completionHandler()


class Notification:
    def __init__(self, callback=None):
        """

        init a notification manager with a callback.

        signature of the callback:
        :param1: action_id, literally the identifier of the button which the user clicked
        :param2: user_info, the data which you passed when sending the notification
        :param3: user_text, the input of the user if a input action is used
        :return: None

        """
        self.center = UN.UNUserNotificationCenter.currentNotificationCenter()
        self._delegate = _NotificationDelegate.alloc().initWithCallback_(callback)
        self.center.setDelegate_(self._delegate)

    def request_authorization_if_needed(self):
        """
        request the authorization of notifications. 
        should be called before starting to send notifications.
        """
        self.center.requestAuthorizationWithOptions_completionHandler_(
            UN.UNAuthorizationOptionAlert | UN.UNAuthorizationOptionSound,
            lambda granted, error: print(f"notification authenticated: state={bool(granted)}, error={error}")
        )

    def add_category(self, category_id, actions):
        """
        register a category of notification.
        you can choose a registered category afterwards when sending a notification.

        :param category_id: the unique identifier of the category. use this to identify a category when sending a notification.
        :param actions: a list of actions of the category

        actions: List[dict["id": str, "title": str, "type": str]]
        every dict symbolizes an action.
        """
        notification_actions = []
        for action_info in actions:
            if action_info['type'] == 'text':
                action = UN.UNTextInputNotificationAction.actionWithIdentifier_title_options_textInputButtonTitle_textInputPlaceholder_(
                    action_info["id"],
                    action_info["title"],
                    0,                              # UNNotificationActionOptionNone
                    "OK",                           # title of the input box
                    "input text..."                 # placeholder text in the box
                )
            else:
                action = UN.UNNotificationAction.actionWithIdentifier_title_options_(
                    action_info["id"],
                    action_info["title"],
                    0,
                )

            notification_actions.append(action)
        
        category = UN.UNNotificationCategory.categoryWithIdentifier_actions_intentIdentifiers_options_(
            category_id, notification_actions, [], 0
        )
        self.center.setNotificationCategories_({category})

    def send_notification(self, title, body, identifier=None, 
                          category_id=None, user_info=None):
        """
        send a notification.
        :param title: title of notification
        :param body: body of notification
        :param identifier: unique identifier of the notification, used to update or remove a notification
        :param category_id: the category registered with add_category. default to be simple notification(only title and body)
        :param user_info: customized data, and receive it later in the callback.
        :return: None
        """
        content = UN.UNMutableNotificationContent.alloc().init()
        content.setTitle_(title)
        content.setBody_(body)

        if identifier is None:
            identifier = str(uuid.uuid4())

        if category_id:
            content.setCategoryIdentifier_(category_id)
        
        if user_info:
            content.setUserInfo_(NSDictionary.dictionaryWithDictionary_(user_info))

        # trigger within 1.0 second
        trigger = UN.UNTimeIntervalNotificationTrigger.triggerWithTimeInterval_repeats_(1.0, False)
        req = UN.UNNotificationRequest.requestWithIdentifier_content_trigger_(
            identifier, content, trigger
        )
        self.center.addNotificationRequest_withCompletionHandler_(req, lambda err: print(f"notification '{title}' added with error:", err))
