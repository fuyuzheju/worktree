from PyQt5.QtCore import QObject, pyqtSignal
from ...history_storage.confirmed_history import ConfirmedHistory
from ...history_storage.pending_queue import PendingQueue
from .sender import UpdateSender
from .receiver import UpdateReceiver
from ....core import ExtOperation, ExtOperationType
import asyncio, websockets, logging, aiohttp, json, threading

from typing import Optional
from app.setup import AppContext

logger = logging.getLogger(__name__)

CHECK_CONNECTION_URI = "http://localhost:1215/health/"
WEBSOCKET_URI = "ws://localhost:1215/"

class UpdateSyncer(QObject):
    request_tree_load = pyqtSignal()
    """
    running on subthread, managing all the synchoronizations
    """
    def __init__(self,
                 context: AppContext,
                 confirmed_history: ConfirmedHistory,
                 pending_queue: PendingQueue,
                 uri: str = WEBSOCKET_URI):
        super().__init__()

        self.context = context
        self.confirmed_history = confirmed_history
        self.pending_queue = pending_queue
        self.uri = uri

        self.wait_flag = threading.Event()
        self.wait_flag.clear()

        self.sender: Optional[UpdateSender] = None
        self.receiver: Optional[UpdateReceiver] = None
    
    def start(self):
        asyncio.run(self.main(self.uri))
    
    async def main(self, uri):
        while True:
            try:
                print("connecting...")
                await self.connect(uri)
            except (ConnectionRefusedError, OSError,
                    websockets.exceptions.ConnectionClosed):
                logger.warning("Websocket connection lost.")
                if self.receiver is not None:
                    await self.receiver.stop()
                if self.sender is not None:
                    await self.sender.stop()
                while not await self.check_conenction(CHECK_CONNECTION_URI):
                    print("checking connection...")
                    await asyncio.sleep(5)
                
                # continue the loop to reconnect

    async def connect(self, uri):
        await self.reconnect_init()
        await self.build_connection(uri)
    
    async def reconnect_init(self):
        print("reconnect init")
    
    async def build_connection(self, uri):
        async with websockets.connect(uri) as socket:
            self.sender = UpdateSender(self.pending_queue, socket)
            self.receiver = UpdateReceiver(socket)
            self.receiver.received.connect(lambda operation:
                asyncio.create_task(self.on_receive(operation)))
            sending = asyncio.create_task(self.sender.start())
            receiving = asyncio.create_task(self.receiver.start())
            await asyncio.gather(sending, receiving)
    
    async def check_conenction(self, uri):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(uri, timeout=5) as response:
                    return response.status == 200
        except Exception as e:
            return False

    async def on_receive(self, data: dict):
        print("on receive")
        await self.sender.stop()

        head = self.pending_queue.get_head_node()
        op = ExtOperation.from_dict(data['operation'])
        if head is not None and head.operation == op.stringify():
            self.pending_queue.pop_front()
            await self.sender.refresh()

        if op.op_type.value == ExtOperationType.UNDO.value:
            self.confirmed_history.pop_head()
        else:
            self.confirmed_history.insert_at_head([op], [data['serial_num']])
        
        self.request_tree_load.emit()
        # wait the main thread to process conflicts
        self.wait_flag.clear()
        self.wait_flag.wait()
        # until the main thread set the flag

        await self.sender.start()
