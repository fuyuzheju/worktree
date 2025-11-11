from websockets import ClientConnection
from PyQt5.QtCore import QObject, pyqtSignal, QSemaphore
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
        self.reconnect_waiting_for_solving_conflicts = None
    
    def start(self):
        asyncio.create_task(self.main())
    
    async def main(self):
        """
        The entrance of the asyncio event loop.
        """ 
        while True:
            while not await self.requester.health_check():
                print("checking connection...")
                await asyncio.sleep(5)
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

    async def connect(self):
        code = await self.reconnect_init()
        if code != 0:
            return
        async with self.requester.build_websocket_connection() as ws:
            self.ws = ws
            self.ws_sender = WebsocketSender(self.database, ws)
            self.ws_receiver = WebsocketReceiver(self.database, ws)
            self.ws_receiver.received.connect(self.received.emit)
            sending = asyncio.create_task(self.ws_sender.start())
            receiving = asyncio.create_task(self.ws_receiver.start())
            checking = asyncio.create_task(self.check())
            await asyncio.gather(sending, receiving, checking)
    
    async def reconnect_init(self):
        print("reconnect_init")
        length = self.requester.get_length()
        if length == -1:
            return -1 
        
        print(length)
        
        flag = True # marking if the local history is identical with the remote one
        head = self.database.confirmed_history.get_head()
        if length != (0 if head is None else head.serial_num):
            print(0, head)
            flag = False
        else:
            if length == 0:
                if head is not None:
                    print(1)
                    flag = False
            else:
                if head is None:
                    print(2)
                    flag = False
                else:
                    remote_head = self.requester.get_hashcodes([length])
                    if remote_head is None:
                        return -1
                    if remote_head[0] != head.history_hash:
                        print(3)
                        flag = False
        
        if flag:
            return 0
        
        print("NOT IDENTICAL, SYNCING")
        
        # find the latest shared operation
        M = 10 # the number of operations in a single query
        k = 0 # the serial num of the latest identical operation
        curr = min(length, 0 if head is None else head.serial_num)
        while curr > 0:
            if curr < M:
                serial_nums = list(range(1, curr+1))
            else:
                serial_nums = list(range(curr-M+1, curr+1))
            
            hashcodes = [
                self.database.confirmed_history.get_by_serial_num(serial_num).history_hash # type: ignore
                for serial_num in serial_nums
            ]
            remote_hashcodes = self.requester.get_hashcodes(serial_nums=serial_nums)
            if remote_hashcodes is None:
                return -1

            for i in range(0, len(serial_nums)):
                if hashcodes[i] == remote_hashcodes[i]:
                    k = i
            if k != 0:
                break

            curr -= M

        assert k != max(length, 0 if head is None else head.serial_num)

        requested_serial_nums = list(range(k+1, length+1))
        remote_operations = self.requester.get_operations(requested_serial_nums)
        if remote_operations is None:
            return -1
        
        # this semaphore is to protect thread safety
        # we need to ensure all conflicts are resolved before starting to
        # build websocket connections
        # so we set this semaphore to wait until tree loader loads the tree,
        # and meanwhile solve the conflicts
        self.reconnect_waiting_for_solving_conflicts = QSemaphore(0)
        self.database.confirmed_history.overwrite(k+1, remote_operations)
        self.reconnect_waiting_for_solving_conflicts.acquire()
        return 0
    
    async def check(self):
        """
        due to some reasons (for example, when client1 has finished
        reconnect init and has not built websocket connection, client2 sends 
        an operation to server, and this operation will never be sent to client1)
        we need to check synchronization continuously
        """
        while self.ws is not None:
            await asyncio.sleep(60)
            head = self.database.confirmed_history.get_head()
            length = self.requester.get_length()
            
            if length != (0 if head is None else head.serial_num):
                # close connection to reconnect-init
                await self.ws.close()
                break
