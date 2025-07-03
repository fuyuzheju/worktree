from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QAction, QMenu, QWidget
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QStandardPaths
from pathlib import Path
from logging.config import dictConfig
import sys, logging

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

    from app import setup_app
    mainwindow_hotkey_manager = setup_app(app)
    exit_code = app.exec_()

    # cleanup
    if mainwindow_hotkey_manager:
        mainwindow_hotkey_manager.cleanup()
        logger.info("Global listener stopped.")
    logger.info("Application quited.\n\n\n\n\n\n\n\n\n\n")
    sys.exit(exit_code)


