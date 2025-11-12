# this file(and proxy.py) declaims apis of utils,
# and serves as a proxy to the implementations
# specific implementations differ from platforms,
# so we place them in 'platform' directory
# this file(and proxy.py) will dynamically detect the platform,
# and import the correct module accordingly

from .proxy import Proxy
from typing import Callable, Optional, Protocol, cast, Type

# functions
set_app_state: Callable[[bool], None] = \
    Proxy('set_app_state')

qkeysequence_to_pynput: Callable[[str], Optional[str]] = \
    Proxy('qkeysequence_to_pynput')

# app_initialization = Proxy('app_initialization')


# classes

class NotificationProtocol(Protocol):
    def __init__(self,
            callback: Optional[Callable[[str, dict, str], None]] = None) -> None:
        return None

    def request_authorization_if_needed(self) -> None:
        return None
    
    def add_category(self, category_id: str, actions: list[dict[str, str]]) -> None:
        return None

    def send_notification(self,
                          title: str,
                          body: str,
                          identifier: Optional[str] = None,
                          category_id: Optional[str] = None,
                          user_info: Optional[dict] = None) -> None:
        return None

Notification = cast(Type[NotificationProtocol], Proxy("Notification"))