from websockets import ClientConnection
from PyQt5.QtCore import QObject, pyqtSignal
from app.history.database import Database
import json, asyncio

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
                 ws: ClientConnection):
        super().__init__()
        self.database = database
        self.ws = ws
    
    async def receive(self):
        async for message in self.ws:
            data = json.loads(message)
            # JSONDecodeError is unexpected
            # if it occurs, let it be thrown to the top level and into error log
            self.received.emit(data)
    
    async def start(self):
        self.receiving_task = asyncio.create_task(self.receive())
        await self.receiving_task
    
    async def stop(self):
        self.receiving_task.cancel()
        try:
            await self.receiving_task
        except asyncio.CancelledError:
            pass
