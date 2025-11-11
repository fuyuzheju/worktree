from PyQt5.QtWidgets import QApplication
from .globals import context
from .requester import Requester
from .user import UserManager
from .history.database import Database
from .history.syncer import Syncer
from .shell import Shell
from .history.loader import TreeLoader
from .reminder import ReminderService
from .UI.main_window import MainWindow
from pathlib import Path

class Application(QApplication):
    def __init__(self, argv):
        super().__init__(argv)
        context.register_app(self)
        self.user_manager = UserManager(Path("./tmp/user_datafile.txt"))
        self.requester = Requester(self.user_manager, Path("./tmp/requester_datafile.txt"))
        self.database = Database(self.user_manager, Path("./tmp/"))
        self.syncer = Syncer(self.database, self.requester)
        self.loader = TreeLoader(self.database, self.requester)
        self.reminder_service = ReminderService(Path("./tmp/reminder.txt"))
        self.shell = Shell(self)
        self.main_window = MainWindow(self.shell, self.loader, self.reminder_service, self.requester, self.user_manager)
        self.main_window.show()
