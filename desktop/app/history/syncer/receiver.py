from websockets import ClientConnection
from PyQt5.QtCore import QObject, pyqtSignal
from app.history.database import Database
from app.requester import Requester

class WebsocketReceiver(QObject):
    received = pyqtSignal(dict)
    """
    Receiver runs on the subthread, and creates asyncio tasks.
    Receiver receives operations from the server, and report it
    throught a signal. Syncer can receive this signal and 
    correspond in the main thread (write to confirmed history).
    """
    def __init__(self,
                 database: Database,
                 requester: Requester,
                 ws: ClientConnection):
        self.database = database
        self.requester = requester
        self.ws = ws
