from websockets import ClientConnection
from PyQt5.QtCore import QObject
from app.history.database import Database
import json, asyncio, websockets

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
                 ws: ClientConnection):
        super().__init__()
        self.database = database
        self.ws = ws
    
    async def send(self):
        while True:
            head = self.database.pending_queue.get_head()
            assert self.database.pending_queue.metadata is not None
            chead = self.database.confirmed_history.get_head()
            expected_serial = (0 if chead is None else chead.serial_num) + 1
            if head is not None:
                await self.ws.send(json.dumps({
                    "action": "update",
                    "operation": head.operation,
                    "expected_serial_num": expected_serial,
                }))
            await asyncio.sleep(1)
    
    async def start(self):
        self.sending_task = asyncio.create_task(self.send())
        await self.sending_task

    async def stop(self):
        self.sending_task.cancel() 
        try:
            await self.sending_task
        except (asyncio.CancelledError, websockets.exceptions.ConnectionClosed):
            pass

