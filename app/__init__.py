from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QAction, QMenu, QWidget, QMessageBox
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QStandardPaths
from pathlib import Path
import logging, shutil, os, zipfile
from logging.config import dictConfig

from .main_window import MainWindow
from .keyboard_listener import HotkeyManager
from .data import WorkTree
from .data.storage import Storage
from .settings import settings_manager
from .controls import quit_signal
from .utils import app_initialization, Notification
from .main_window.console.commands.utils import time_parser

ICON_PATH = "assets/worktree-icon.png"

DELAY_ACTION_ID = 'delay'
COMPLETE_ACTION_ID = 'complete'

class AppBasic(QApplication):
    def __init__(self, argv):
        super().__init__(argv)
        self.setApplicationName("worktree")
        self.setOrganizationName("fuyuzheju")
        self.setOrganizationDomain("fuyuzheju.com")
        self.application_data_dir: Path = Path(QStandardPaths.writableLocation(QStandardPaths.AppDataLocation))

        # log
        log_dir: Path = self.application_data_dir / "logs"
        self.setup_logging(log_dir)
        self.logger: logging.Logger = logging.getLogger('app')
        self.logger.info(f"Logging configured. Dir: {log_dir}")

        # work tree
        self.work_tree: WorkTree = WorkTree()

        # storage
        self.storage_dir = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
        self.storage_dir: Path = Path(self.storage_dir) / "storage"
        self.storage: Storage = Storage(self.work_tree, self.storage_dir)
        self.logger.debug(f"Storage configured. Dir: {self.storage_dir}")
        
        # main window
        self.main_window: MainWindow = MainWindow(self.work_tree)
        self.main_window.show()
        self.logger.debug("Main window created.")

        self.main_window.cleanup_history_signal.connect(self.storage.cleanup_history)

        # tray icon
        self.setup_tray_icon(self.main_window)
        if settings_manager.get("createTrayIcon", type=bool):
            self.tray_icon.show()
            self.logger.info("Tray icon created.")
        else:
            self.tray_icon.hide()
            self.logger.info("Tray icon hidden.")

        # hotkey
        self.mainwindow_hotkey_manager = HotkeyManager("hotkey/mainWindowHotkey", self.main_window)
        self.logger.debug("Hotkey manager created.")

        quit_signal.connect(self.quit)
        app_initialization(self)
        self.logger.debug("Application Initialized.")
    
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

    def setup_tray_icon(self, connected_window: MainWindow):
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

    def cleanup(self):
        self.quit()
        if self.mainwindow_hotkey_manager:
            self.mainwindow_hotkey_manager.cleanup()
            self.logger.info("Global listener stopped.")
        self.logger.info("Application quited.\n\n\n\n\n\n\n\n\n\n")


class Application(AppBasic):
    def __init__(self, argv):
        super().__init__(argv)
        self.main_window.save_file_signal.connect(self.save_tree)
        self.main_window.open_file_signal.connect(self.open_tree)
        # self.reminder_notifier = Notification(self.reminder_notification_process)
        # self.reminder_notifier.request_authorization_if_needed()
        # self.reminder_notifier.add_category("reminder", [
        #     {"id": DELAY_ACTION_ID, "title": "delay", "type": "text"},
        #     {"id": COMPLETE_ACTION_ID, "title": "complete", "type": ""},
        # ])
        self.work_tree.reminder_service.reminder_due.connect(self.reminder_notify)

    def save_tree(self, output_path: str):
        if self.storage == None:
            return
        if output_path.endswith('.zip'):
            output_path = output_path[:-4]
        shutil.make_archive(output_path, 'zip', root_dir=self.STORAGE_DIR, 
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
        
        if os.path.exists(self.STORAGE_DIR):
            shutil.rmtree(self.STORAGE_DIR)
        if not os.path.exists(self.STORAGE_DIR):
            os.mkdir(self.STORAGE_DIR)   #clean storage

        shutil.unpack_archive(filepath, extract_dir=self.STORAGE_DIR)
        try:
            self.storage.history_storage.current_snapshot_dir, self.storage.history_storage.op_count_since_snapshot = self.storage.history_storage.get_latest_snapshot()
            self.storage.history_storage.load_from_disk()
            if self.storage.history_storage.current_snapshot_dir == None:
                raise ValueError("No history snapshots found.")
        except Exception as e:
            QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
            shutil.rmtree(self.STORAGE_DIR)
            os.mkdir(self.STORAGE_DIR)
    
    def reminder_notification_process(self, action_id, user_info, user_text):
        if action_id == DELAY_ACTION_ID:
            reminder = self.work_tree.get_reminder_by_id(user_info["reminder_id"])
            # print(user_info, user_text)
            try:
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
