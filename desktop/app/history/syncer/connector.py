from websockets import ClientConnection
from PyQt5.QtCore import QObject, pyqtSignal
from app.history.database import Database
from app.requester import Requester
from .receiver import WebsocketReceiver
from .sender import WebsocketSender

class NetworkConnector(QObject):
    received = pyqtSignal(dict) # forward the signal from receiver
    """
    NetworkConnector runs on the subthread, and controls the sender
    and receiver.
    NetworkConnector processes the connections(websocket), and runs
    the asyncio event loop. It is like a central event dispatcher.
    """
    def __init__(self,
                 database: Database,
                 requester: Requester,):
        super().__init__()
        self.database = database
        self.requester = requester
    
    def on_connect(self, ws: ClientConnection):
        self.ws_receiver = WebsocketReceiver(self.database, self.requester, ws)
        self.ws_sender = WebsocketSender(self.database, self.requester, ws)
        self.ws_receiver.received.connect(self.received.emit)
