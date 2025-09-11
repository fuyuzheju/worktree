from websockets.client import WebSocketClientProtocol
from ...history_storage.pending_queue import PendingQueue
from ....core import ExtOperation
import asyncio, json

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from websockets.legacy.client import WebSocketClientProtocol

class UpdateSender:
    """
    send from pending queue
    """
    def __init__(self, queue: PendingQueue, socket: WebSocketClientProtocol):
        self.queue = queue # read only
        self.socket = socket
        self.running = False
        self.is_sent = False # marks if the head is already sent
    
    async def start(self):
        self.running = True
        while self.running:
            await self.check_queue()
            await asyncio.sleep(1)
    
    async def stop(self):
        self.running = False
    
    async def refresh(self):
        self.is_sent = False
    
    async def check_queue(self):
        if self.is_sent:
            return
        head = self.queue.get_head_node()
        if head is None:
            return
        operation = ExtOperation.from_dict(json.loads(head.operation))
        await self.send(operation)
    
    async def send(self, operation: ExtOperation):
        print(f"sending {operation}")
        await self.socket.send(operation.stringify())
        self.is_sent = True
