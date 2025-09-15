from websockets.client import WebSocketClientProtocol
from PyQt5.QtCore import pyqtSignal, QObject
import json

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from websockets.legacy.client import WebSocketClientProtocol

class UpdateReceiver(QObject):
    """
    receive from server and put into confirmed history
    """
    received = pyqtSignal(dict)
    def __init__(self, socket: WebSocketClientProtocol):
        super().__init__()
        self.socket = socket
        self.running = False
    
    async def start(self):
        async for message in self.socket:
            data = json.loads(message)
            self.received.emit(data)
    
    def stop(self):
        self.running = False
    
    
