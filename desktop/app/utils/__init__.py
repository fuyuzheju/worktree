# this file(and proxy.py) declaims apis of utils,
# and serves as a proxy to the implementations
# specific implementations differ from platforms,
# so we place them in 'platform' directory
# this file(and proxy.py) will dynamically detect the platform,
# and import the correct module accordingly

from .proxy import Proxy

# functions
set_app_state = Proxy('set_app_state')
qkeysequence_to_pynput = Proxy('qkeysequence_to_pynput')
app_initialization = Proxy('app_initialization')


# classes
Notification = Proxy('Notification')
