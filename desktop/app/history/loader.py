from PyQt5.QtCore import QObject, pyqtSignal
from app.requester import Requester
from app.history.database import Database

class TreeLoader(QObject):
    """
    Tree loader loads and stores a tree from all the history(both
    confirmed and pending), and checks conflicts meanwhile.
    When conflicts occur, loader asks the user to overwrite the history
    by pending queue, or scarcely the discard the pending operation that
    leads to conflict.
    In the first case, we calls an HTTP API of server, to overwrite the
    confirmed history, and synchronize it later.
    In the second case, we pop the head of the pending queue.
    """
    reloaded = pyqtSignal()

    def __init__(self,
                 database: Database,
                 requester: Requester):
        super().__init__()
        
        self.database = database
        self.requester = requester