# Receiver and Sender in this submodule run in a subthread,
# on which an asyncio loop is running
# all sending and receiving from the network is separated from the main thread
# this submodule is highly decoupled from the main thread,
# and they don't care about what is running on each other
# our algorithms are designed to ensure no conflict happens
# in the whole application

from PyQt5.QtCore import QObject, pyqtSlot, QThread
from app.history.database import Database
from app.history.core import parse_operation, Operation
from app.requester import Requester
from .connector import NetworkConnector
from typing import override
import qasync, asyncio

class ConnectionThread(QThread):
    def __init__(self, worker, parent=None):
        super().__init__(parent)
        self.worker = worker

    @override
    def run(self):
        loop = qasync.QEventLoop(self)
        asyncio.set_event_loop(loop)
        loop.call_soon(self.worker.start)
        loop.run_forever()

class Syncer(QObject):
    """
    Syncer is the manager of the subthread and controls the network connector.
    Syncer monitors the signals from the it, and operates the
    database accordingly. The syncer itself runs on the main thread.
    """
    def __init__(self,
                 database: Database,
                 requester: Requester,):
        super().__init__()
        
        self.database = database
        self.requester = requester
        self.network_connector = NetworkConnector(database, requester)
        self.network_thread = ConnectionThread(self.network_connector)

        self.network_connector.moveToThread(self.network_thread)
        self.network_connector.received.connect(self.on_receive)
        self.network_thread.start()
    
    @pyqtSlot(dict)
    def on_receive(self, data):
        print("on receive:", data)
        if data["action"] == "update":
            operation = parse_operation(data["operation"])
            assert operation is not None
            serial_num = data["serial_num"]
        
            head = self.database.pending_queue.get_head()
            # print("###", operation.stringify(), {} if head is None else head.operation)
            if head is not None and operation.stringify() == head.operation:
                print("POP")
                self.database.pending_queue.pop()
            self.database.confirmed_history.insert_at_head(operation, serial_num)
