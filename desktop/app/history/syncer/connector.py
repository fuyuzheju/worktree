from websockets import ClientConnection
from PyQt5.QtCore import QObject, pyqtSignal
from app.history.database import Database
from app.requester import Requester
from .receiver import WebsocketReceiver
from .sender import WebsocketSender
import asyncio, websockets, logging

logger = logging.getLogger(__name__)

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
        self.ws_receiver = None
        self.ws_sender = None
        self.ws = None
    
    def start(self):
        asyncio.create_task(self.main())
    
    async def main(self):
        """
        The entrance of the asyncio event loop.
        """ 
        while True:
            try:
                print("connecting...")
                await self.connect()
            except (ConnectionRefusedError, OSError,
                    websockets.exceptions.ConnectionClosed):
                logger.info("Websocket connection lost.")
                print("websocket connection lost")
                if self.ws_receiver is not None:
                    await self.ws_receiver.stop()
                if self.ws_sender is not None:
                    await self.ws_sender.stop()
                while not await self.requester.health_check():
                    print("checking connection...")
                    await asyncio.sleep(5)

    async def connect(self):
        await self.reconnect_init()
        async with self.requester.build_websocket_connection() as ws:
            self.ws = ws
            self.on_connect(self.ws)
            self.ws_sender = WebsocketSender(self.database, ws)
            self.ws_receiver = WebsocketReceiver(self.database, ws)
            sending = asyncio.create_task(self.ws_sender.start())
            receiving = asyncio.create_task(self.ws_receiver.start())
            await asyncio.gather(sending, receiving)
            print("hello")
    
    async def reconnect_init(self):
        # raise NotImplementedError()
        print("reconnect init")
    
    def on_connect(self, ws: ClientConnection):
        self.ws_receiver = WebsocketReceiver(self.database, ws)
        self.ws_sender = WebsocketSender(self.database, ws)
        self.ws_receiver.received.connect(self.received.emit)
