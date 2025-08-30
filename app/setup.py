from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QAction, QMenu, QWidget, QMessageBox
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QStandardPaths
from pathlib import Path
import logging, shutil, os, zipfile
from logging.config import dictConfig

ICON_PATH = "assets/worktree-icon.png"

DELAY_ACTION_ID = 'delay'
COMPLETE_ACTION_ID = 'complete'

class AppContext:
    def __init__(self, *, work_tree, settings_manager):
        self.work_tree = work_tree
        self.settings_manager = settings_manager


class AppBasic(QApplication):
    """
    basic initializations of app,
    including:
        - interactions with the OS
            - app identifiers(registering app to the OS)
            - configure loggings
            - load settings, read user preferences
        - data core initialization
            - create WorkTree
            - app context
            - configure storage to the disk
    """
    def __init__(self, argv):
        super().__init__(argv)

        # app identifiers
        self.setApplicationName("worktree")
        self.setOrganizationName("fuyuzheju")
        self.setOrganizationDomain("fuyuzheju.com")
        self.app_data_dir: Path = Path(QStandardPaths.writableLocation(QStandardPaths.AppDataLocation))

        # log
        log_dir: Path = self.app_data_dir / "logs"
        self.setup_logging(log_dir)
        self.logger: logging.Logger = logging.getLogger('app')
        self.logger.info(f"Logging configured. Dir: {log_dir}")

        # settings
        from .settings import settings_manager
        self.settings_manager = settings_manager

        # work tree
        from .data.worktree import WorkTree
        self.work_tree: WorkTree = WorkTree()

        # shared context
        self.context = AppContext(work_tree=self.work_tree,
                                  settings_manager=self.settings_manager,)

        # storage
        from .data.storage import Storage
        self.storage_dir: Path = Path(self.app_data_dir) / "storage"
        self.storage: Storage = Storage(self.work_tree, self.storage_dir)
        self.logger.info(f"Storage configured. Dir: {self.storage_dir}")
    
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
        # print("--- Logging configured ---")
        return 0


class Application(AppBasic):
    """
    extended functions of app logic
    - UI init
        - create main window
        - create tray icon
    - file system
    - reminder notifications
    - global hotkey
    """
    def __init__(self, argv):
        super().__init__(argv)
        
        # main window
        from .windows.main_window import MainWindow
        self.main_window: MainWindow = MainWindow(self.work_tree)
        self.main_window.show()
        self.logger.info("Main window created.")

        self.main_window.cleanup_history_signal.connect(self.storage.cleanup_history)

        # tray icon
        self.setup_tray_icon(self.main_window)
        if self.settings_manager.get("createTrayIcon", type=bool):
            self.tray_icon.show()
            self.logger.info("Tray icon created.")
        else:
            self.tray_icon.hide()
            self.logger.info("Tray icon hidden.")

        # file system
        self.main_window.save_file_signal.connect(self.save_tree)
        self.main_window.open_file_signal.connect(self.open_tree)

        # reminder notifications
        from .utils import Notification
        if self.settings_manager.get("reminderNotifications"):
            self.reminder_notifier = Notification(self.reminder_notification_process)
            self.reminder_notifier.request_authorization_if_needed()
            self.reminder_notifier.add_category("reminder", [
                {"id": DELAY_ACTION_ID, "title": "delay", "type": "text"},
                {"id": COMPLETE_ACTION_ID, "title": "complete", "type": ""},
            ])
            self.work_tree.reminder_service.reminder_due.connect(self.reminder_notify)
            self.logger.info("Reminder notifications initialized.")
        else:
            self.logger.info("Reminder notifications cancelled due to user preferences.")

        # hotkey
        from .keyboard_listener import HotkeyManager
        self.mainwindow_hotkey_manager = HotkeyManager("hotkey/mainWindowHotkey", self.main_window)
        self.logger.info("Hotkey manager created.")

        # other
        from .controls import quit_signal
        from .utils import app_initialization
        quit_signal.connect(self.quit)
        app_initialization(self)
        self.logger.info("Application Initialized.")

    def setup_tray_icon(self, connected_window):
        from .controls import quit_signal
        self.tray_icon = QSystemTrayIcon(QIcon(ICON_PATH), connected_window)
        menu = QMenu()

        quit_action = QAction('exit', connected_window)
        quit_action.triggered.connect(quit_signal.emit)
        menu.addAction(quit_action)
        self.tray_icon.setContextMenu(menu)
        self.tray_icon.show()
        def on_tray_icon_activated(reason):
            if reason == QSystemTrayIcon.DoubleClick:
                connected_window.to_frontground()
        self.tray_icon.activated.connect(on_tray_icon_activated)

    def save_tree(self, output_path: str):
        if self.storage == None:
            return
        if output_path.endswith('.zip'):
            output_path = output_path[:-4]
        shutil.make_archive(output_path, 'zip', root_dir=self.storage_dir, 
                            base_dir='.')
        self.logger.debug(f'Save Tree to {output_path}')

    def open_tree(self, filepath: str):
        if self.storage == None:
            return

        try:
            with zipfile.ZipFile(filepath, 'r') as f:
                contents = f.namelist()
        except zipfile.BadZipFile as e:
            QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
        except Exception as e:
            QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
        
        if os.path.exists(self.storage_dir):
            shutil.rmtree(self.storage_dir)
        if not os.path.exists(self.storage_dir):
            os.mkdir(self.storage_dir)   #clean storage

        shutil.unpack_archive(filepath, extract_dir=self.storage_dir)
        try:
            self.storage.history_storage.current_snapshot_dir, self.storage.history_storage.op_count_since_snapshot = self.storage.history_storage.get_latest_snapshot()
            self.storage.history_storage.load_from_disk()
            if self.storage.history_storage.current_snapshot_dir == None:
                raise ValueError("No history snapshots found.")
        except Exception as e:
            QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
            shutil.rmtree(self.storage_dir)
            os.mkdir(self.storage_dir)
    
    def reminder_notification_process(self, action_id, user_info, user_text):
        if action_id == DELAY_ACTION_ID:
            reminder = self.work_tree.get_reminder_by_id(user_info["reminder_id"])
            try:
                from .shell.commands.utils import time_parser
                due_time = time_parser(user_text)
            except:
                pass
            else:
                self.work_tree.set_reminder(reminder.reminder_id, due_time=due_time, active=True)
                self.logger.info(f"Reminder Delayed to time: {due_time}(with format '{user_text}')")

        elif action_id == COMPLETE_ACTION_ID:
            reminder = self.work_tree.get_reminder_by_id(user_info["reminder_id"])
            res = self.work_tree.complete_node(reminder.node_id)
            if res != 0:
                pass

        else:
            self.main_window.to_frontground()
    
    def reminder_notify(self, reminder):
        self.reminder_notifier.send_notification(
            "Reminder Due",
            reminder.message,
            identifier=f"com.fuyuzheju.worktree.reminder.{reminder.reminder_id}",
            category_id="reminder",
            user_info={"reminder_id": reminder.reminder_id}
        )
        self.logger.info(f"Reminder due: {reminder.message} ({reminder.reminder_id}).")

    def cleanup(self):
        self.quit()
        if self.mainwindow_hotkey_manager:
            self.mainwindow_hotkey_manager.cleanup()
            self.logger.info("Global listener stopped.")
        self.logger.info("Application quited.\n\n\n\n\n\n\n\n\n\n")
