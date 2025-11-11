from pathlib import Path
import logging
from logging.config import dictConfig

def setup_logging(log_dir: Path):
    log_dir.mkdir(parents=True, exist_ok=True)
    debug_log_file = log_dir / "debug.log"
    error_log_file = log_dir / "error.log"
    debug_log_file.touch(exist_ok=True)
    error_log_file.touch(exist_ok=True)
    LOGGING_CONFIG = {
        "version": 1,
        "formatters": {
            "standard": {
                "format": "----- %(asctime)s ------\n ### %(levelname)s ### [%(name)s]: %(message)s\n"
            }
        },
        "handlers": {
            "debug": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "DEBUG",
                "formatter": "standard",
                "filename": debug_log_file,
                "maxBytes": 5 * 1024 * 1024, # 5MB
                "backupCount": 3,
                "encoding": "utf-8"
            },
            "error": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": "ERROR",
                "formatter": "standard",
                "filename": error_log_file,
                "maxBytes": 5 * 1024 * 1024, # 5MB
                "backupCount": 3,
                "encoding": "utf-8"
            },
            "console": {
                "class": "logging.StreamHandler",
                "level": "DEBUG",
                "formatter": "standard",
                "stream": "ext://sys.stdout"
            }
        },
        "root": {
            "level": "DEBUG",
            "handlers": ["debug", "error", "console"]
        }
    }
    dictConfig(LOGGING_CONFIG)

    import qasync # to initialize it and its loggings
    qasync_logger = logging.getLogger("qasync")
    qasync_logger.setLevel(logging.WARNING)

setup_logging(Path("./tmp/log/"))
logger = logging.getLogger(__name__)

from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction
from PyQt5.QtGui import QIcon
from .globals import context
from .requester import Requester
from .user import UserManager
from .history.database import Database
from .history.syncer import Syncer
from .shell import Shell
from .history.loader import TreeLoader
from .reminder import ReminderService
from .UI.main_window import MainWindow
import sys

ICON_PATH = "assets/worktree-icon.png"

class Application(QApplication):
    def __init__(self, argv):
        super().__init__(argv)
        context.register_app(self)

        self.setApplicationName("worktree")
        self.setOrganizationName("fuyuzheju")
        self.setOrganizationDomain("fuyuzheju.com")
        self.logger = logging.getLogger(__name__)

        self.user_manager = UserManager(Path("./tmp/user_datafile.txt"))
        self.requester = Requester(self.user_manager, Path("./tmp/requester_datafile.txt"))
        self.database = Database(self.user_manager, Path("./tmp/"))
        self.syncer = Syncer(self.database, self.requester)
        self.loader = TreeLoader(self.database, self.requester)
        self.reminder_service = ReminderService(Path("./tmp/reminder.txt"))
        self.shell = Shell(self)
        self.main_window = MainWindow(self.shell, self.loader, self.reminder_service, self.requester, self.user_manager)
        self.main_window.show()

        self.setup_tray_icon(self.main_window)
        if context.settings_manager.get("createTrayIcon", type=bool):
            self.tray_icon.show()
            logger.info("Tray icon created.")
        else:
            self.tray_icon.hide()
            logger.info("Tray icon hidden.")

    def setup_tray_icon(self, connected_window: MainWindow):
        self.tray_icon = QSystemTrayIcon(QIcon(ICON_PATH), connected_window)
        menu = QMenu()

        quit_action = QAction('exit', connected_window)
        quit_action.triggered.connect(lambda : sys.exit(0))
        menu.addAction(quit_action)
        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()
        def on_tray_icon_activated(reason):
            if reason == QSystemTrayIcon.DoubleClick:
                connected_window.to_frontground()
        self.tray_icon.activated.connect(on_tray_icon_activated)
