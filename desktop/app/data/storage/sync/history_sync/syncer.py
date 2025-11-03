from PyQt5.QtCore import QObject, pyqtSignal, pyqtSlot, QThread
from ...history_storage.confirmed_history import ConfirmedHistory
from ...history_storage.pending_queue import PendingQueue
from .sender import UpdateSender
from .receiver import UpdateReceiver
from ....core import ExtOperation, ExtOperationType
import asyncio, websockets, logging, aiohttp, json, threading

from typing import Optional
from app.setup import AppContext

logger = logging.getLogger(__name__)

class UpdateSyncer(QObject):
    request_tree_load = pyqtSignal()
    close = pyqtSignal()
    """
    running on subthread, managing all the synchoronizations
    """
    def __init__(self,
                 context: AppContext,
                 confirmed_history: ConfirmedHistory,
                 pending_queue: PendingQueue,
                 uri: Optional[str] = None):
        super().__init__()

        self.context = context
        self.confirmed_history = confirmed_history
        self.pending_queue = pending_queue
        self.uri = uri or self.context.settings_manager.get("internal/websocketURI")

        self.wait_flag = threading.Event()
        self.wait_flag.clear()
        self.running = True
        self.close.connect(self.stop)

        self.sender: Optional[UpdateSender] = None
        self.receiver: Optional[UpdateReceiver] = None
        self.socket: Optional[websockets.ClientConnection] = None
    
    def start(self):
        asyncio.get_event_loop().run_until_complete(self.main(self.uri))
        self.deleteLater()
    
    @pyqtSlot()
    def stop(self):
        self.running = False
        if self.socket is not None:
            asyncio.create_task(self.socket.close()) # receiver stops automatically here
        if self.sender is not None:
            self.sender.stop()
    
    async def main(self, uri):
        while self.running:
            try:
                print("connecting...")
                await self.connect(uri)
            except (ConnectionRefusedError, OSError,
                    websockets.exceptions.ConnectionClosed):
                logger.warning("Websocket connection lost.")
                if self.receiver is not None:
                    self.receiver.stop()
                if self.sender is not None:
                    self.sender.stop()
                while not await self.check_connection(
                        self.context.settings_manager.get("internal/healthCheckURL")):
                    print("checking connection...")
                    await asyncio.sleep(5)
                    if not self.running:
                        break

    async def connect(self, uri):
        await self.reconnect_init()
        await self.build_connection(uri)
    
    async def reconnect_init(self):
        print("reconnect init")
    
    async def build_connection(self, uri):
        async with websockets.connect(uri) as socket:
            self.socket = socket
            self.sender = UpdateSender(self.pending_queue, socket)
            self.receiver = UpdateReceiver(socket)
            self.receiver.received.connect(lambda operation:
                asyncio.create_task(self.on_receive(operation)))
            sending = asyncio.create_task(self.sender.start())
            receiving = asyncio.create_task(self.receiver.start())
            await asyncio.gather(sending, receiving)
    
    async def check_connection(self, uri):
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
