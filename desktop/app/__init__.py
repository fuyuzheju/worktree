from PyQt5.QtCore import QStandardPaths
from pathlib import Path
from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QAction, QMessageBox
from PyQt5.QtGui import QIcon
from .globals import context, ENV
from .requester import Requester
from .user import UserManager
from .history.database import Database
from .history.syncer import Syncer
from .shell import Shell
from .history.loader import TreeLoader
from .reminder import ReminderService
from .UI.main_window import MainWindow
from .keyboard_listener import HotkeyManager
from logging.config import dictConfig
import logging, shutil, zipfile, os

ICON_PATH = "/Users/fubin-computer/development/worktree/desktop/assets/worktree-icon.png"

class Application(QApplication):
    def __init__(self, argv):
        super().__init__(argv)

        self.setApplicationName("worktree")
        self.setOrganizationName("fuyuzheju")
        self.setOrganizationDomain("fuyuzheju.com")
        if ENV:
            self.APP_ROOT = Path(QStandardPaths.writableLocation(QStandardPaths.AppLocalDataLocation))
        else:
            self.APP_ROOT = Path("./tmp/")
        self.APP_ROOT.mkdir(exist_ok=True, parents=True)
        (self.APP_ROOT / "log").mkdir(exist_ok=True)
        (self.APP_ROOT / "requester_datafile.txt").touch(exist_ok=True)
        (self.APP_ROOT / "user_datafile.txt").touch(exist_ok=True)
        (self.APP_ROOT / "reminder.txt").touch(exist_ok=True)

        self.setup_logging(self.APP_ROOT / "log")
        context.setup(self)
        self.logger = logging.getLogger(__name__)

        self.user_manager = UserManager(self.APP_ROOT / "user_datafile.txt")
        self.requester = Requester(self.user_manager, self.APP_ROOT / "requester_datafile.txt")
        self.database = Database(self.user_manager, self.APP_ROOT, "storage.db")
        self.syncer = Syncer(self.database, self.requester)
        self.loader = TreeLoader(self.database, self.requester)
        self.reminder_service = ReminderService(self.user_manager, self.APP_ROOT, "reminder.txt")
        self.shell = Shell(self)
        self.main_window = MainWindow(self.shell, self.loader, self.reminder_service, self.requester, self.user_manager)
        self.hotkey_manager = HotkeyManager(self.main_window)

        self.main_window.show()
        self.main_window.save_file_signal.connect(self.save_file)
        self.main_window.open_file_signal.connect(self.open_file)

        self.setup_tray_icon(self.main_window)
        if context.settings_manager.get("createTrayIcon", type=bool):
            self.tray_icon.show()
            self.logger.info("Tray icon created.")
        else:
            self.tray_icon.hide()
            self.logger.info("Tray icon hidden.")
        
        self.logger.info(f"Application initialized in {self.APP_ROOT}")

    def setup_tray_icon(self, connected_window: MainWindow):
        self.tray_icon = QSystemTrayIcon(QIcon(ICON_PATH), connected_window)
        menu = QMenu()

        quit_action = QAction('exit', connected_window)
        quit_action.triggered.connect(context.current_app.quit)
        menu.addAction(quit_action)
        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()
        def on_tray_icon_activated(reason):
            if reason == QSystemTrayIcon.DoubleClick:
                connected_window.to_frontground()
        self.tray_icon.activated.connect(on_tray_icon_activated)

    def setup_logging(self, log_dir: Path):
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
    
    def save_file(self, output_path: str):
        if output_path.endswith('.zip'):
            output_path = output_path[:-4]
        shutil.make_archive(output_path, 'zip',
                            root_dir=self.APP_ROOT / self.user_manager.user_id(),
                            base_dir='.')
        self.logger.debug(f"Save Tree to {output_path}")
    
    def open_file(self, filepath: str):
        try:
            with zipfile.ZipFile(filepath, 'r') as f:
                contents = f.namelist()

        except Exception as e:
            QMessageBox.critical(None, 'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)

        storage_dir = self.APP_ROOT / self.user_manager.user_id()
        if os.path.exists(storage_dir):
            shutil.rmtree(storage_dir)
        if not os.path.exists(storage_dir):
            os.mkdir(storage_dir)

        shutil.unpack_archive(filepath, extract_dir=storage_dir)
        self.database.reload_database()
