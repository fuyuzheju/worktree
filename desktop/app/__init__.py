from PyQt5.QtWidgets import QApplication
from .requester import Requester
from .user import UserManager
from .history.database import Database
from .history.syncer import Syncer
from pathlib import Path

class Application(QApplication):
    def __init__(self, argv):
        super().__init__(argv)
        import app.globals
        self.user_manager = UserManager(Path("./tmp/user_datafile.txt"))
        self.requester = Requester(self.user_manager, Path("./tmp/requester_datafile.txt"))
        self.database = Database(self.user_manager, Path("./tmp/"))
        self.syncer = Syncer(self.database, self.requester)
