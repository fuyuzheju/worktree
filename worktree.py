from PyQt5.QtWidgets import QApplication
from PyQt5.QtCore import QStandardPaths
from pathlib import Path
from logging.handlers import RotatingFileHandler
import sys, logging

def global_exception_hook(exctype, value, tb):
    logging.error("Uncaught exception:", exc_info=(exctype, value, tb))

def setup_logging(log_dir):
    log_file = log_dir / "app.log"
    log_file.touch(exist_ok=True)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    if root_logger.handlers:
        root_logger.handlers.clear()
    
    file_handler = RotatingFileHandler(
        filename=log_file, 
        maxBytes=5 * 1024 * 1024,  # 5 MB
        backupCount=3,
        encoding='utf-8'
    )
    log_format = "----- %(asctime)s ------\n ### %(levelname)s ### [%(name)s]: %(message)s\n"
    formatter = logging.Formatter(log_format)
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)

    print("--- Logging configured ---")
    return root_logger

def quit_application(app):
    app.quit()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    app.setApplicationName("worktree")
    app.setOrganizationName("fuyuzheju")
    app.setOrganizationDomain("fuyuzheju.com")
    sys.excepthook = global_exception_hook

    log_dir = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    log_dir = Path(log_dir) / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    logger = setup_logging(log_dir)
    print(f"printing logs in dir {log_dir}.")
    logger.info(f"Logging configured. Dir: {log_dir}")

    storage_dir = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    storage_dir = Path(storage_dir) / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    from app.main_window import MainWindow
    from app.keyboard_listener import HotkeyManager
    from app.data.tree import WorkTree
    from app.data.storage import Storage
    from app.controls import quit_signal

    work_tree = WorkTree()
    storage = Storage(work_tree, storage_dir, 20)
    logger.debug(f"Storage configured. Dir: {storage_dir}")
    main_window = MainWindow(work_tree)
    main_window.show()
    logger.debug("Main window created.")

    mainwindow_hotkey_manager = HotkeyManager("hotkey/mainWindowHotkey", main_window)
    logger.debug("Hotkey manager created.")

    quit_signal.connect(app.quit)
    logger.debug("Application Initialized.")
    exit_code = app.exec_()

    # cleanup
    if mainwindow_hotkey_manager:
        mainwindow_hotkey_manager.cleanup()
        logger.info("Global listener stopped.")
    logger.info("Application quited.\n\n\n")
    sys.exit(exit_code)


