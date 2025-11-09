from websockets import ClientConnection
from PyQt5.QtCore import QObject, pyqtSignal
from app.history.database import Database
from app.requester import Requester

class WebsocketSender(QObject):
    """
    Sender runs on the subthread, and creates asyncio tasks.
    Sender keeps sending operations from pending queue,
    careless about what others are doing.
    Sender only reads pending queue, while other components
    will correctly operates pending queue.
    """
    def __init__(self,
                 database: Database,
                 requester: Requester,
                 ws: ClientConnection):
        self.database = database
        self.requester = requester
        self.ws = ws
