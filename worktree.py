from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QAction, QMenu, QWidget
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QStandardPaths
from pathlib import Path
from logging.config import dictConfig
import sys, logging

ICON_PATH = "worktree-icon.png"

def global_exception_hook(exctype, value, tb):
    logging.error("Uncaught exception:", exc_info=(exctype, value, tb))

def setup_logging(log_dir):
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
    print("--- Logging configured ---")
    return 0

def quit_application(app):
    app.quit()

def setup_tray_icon(connected_window: QWidget):
    tray_icon = QSystemTrayIcon(QIcon(ICON_PATH), connected_window)
    menu = QMenu()

    quit_action = QAction('exit', connected_window)
    quit_action.triggered.connect(quit_signal.emit)
    menu.addAction(quit_action)
    tray_icon.setContextMenu(menu)
    tray_icon.show()
    def on_tray_icon_activated(reason):
        if reason == QSystemTrayIcon.DoubleClick:
            connected_window.to_frontground()
    tray_icon.activated.connect(on_tray_icon_activated)
    return tray_icon

if __name__ == '__main__':
    app = QApplication(sys.argv)
    app.setApplicationName("worktree")
    app.setOrganizationName("fuyuzheju")
    app.setOrganizationDomain("fuyuzheju.com")
    sys.excepthook = global_exception_hook

    log_dir = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    log_dir = Path(log_dir) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(log_dir)
    logger = logging.getLogger()
    print(f"printing logs in dir {log_dir}.")
    logger.info(f"Logging configured. Dir: {log_dir}")

    storage_dir = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    storage_dir = Path(storage_dir) / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    from app.main_window import MainWindow
    from app.keyboard_listener import HotkeyManager
    from app.data.tree import WorkTree
    from app.data.storage import Storage
    from app.settings import settings_manager
    from app.controls import quit_signal

    work_tree = WorkTree()
    storage = Storage(work_tree, storage_dir, 20)
    logger.debug(f"Storage configured. Dir: {storage_dir}")
    main_window = MainWindow(work_tree)
    main_window.show()
    logger.debug("Main window created.")
    if settings_manager.get("createTrayIcon", type=bool):
        tray_icon = setup_tray_icon(main_window)

    mainwindow_hotkey_manager = HotkeyManager("hotkey/mainWindowHotkey", main_window)
    logger.debug("Hotkey manager created.")

    quit_signal.connect(app.quit)
    logger.debug("Application Initialized.")
    exit_code = app.exec_()

    # cleanup
    if mainwindow_hotkey_manager:
        mainwindow_hotkey_manager.cleanup()
        logger.info("Global listener stopped.")
    logger.info("Application quited.\n\n\n\n\n\n\n\n\n\n")
    sys.exit(exit_code)


