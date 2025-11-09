# Receiver and Sender in this submodule run in a subthread,
# on which an asyncio loop is running
# all sending and receiving from the network is separated from the main thread
# this submodule is highly decoupled from the main thread,
# and they don't care about what is running on each other
# our algorithms are designed to ensure no conflict happens
# in the whole application

from PyQt5.QtCore import QObject, pyqtSlot
from app.history.database import Database
from app.requester import Requester
from .connector import NetworkConnector

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
    
    @pyqtSlot(dict)
    def onReceive(data):
        pass
