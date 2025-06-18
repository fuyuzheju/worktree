from PyQt5.QtWidgets import QApplication
from app.main_window import MainWindow
from app.keyboard_listener import HotkeyManager
from pathlib import Path
from logging.handlers import RotatingFileHandler
import sys, logging
from app.data.tree import WorkTree
from app.data.storage import Storage
from app.controls import quit_signal

def global_exception_hook(exctype, value, tb):
    logging.error("Uncaught exception:", exc_info=(exctype, value, tb))

def setup_logging(log_dir):
    log_file = log_dir / "app.log"
    log_file.touch(exist_ok=True)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
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
    if getattr(sys, 'frozen', False):
        root_dir = Path(sys.executable).parent.parent.parent
    else:
        root_dir = Path(__file__).parent
    log_dir = root_dir / "logs"
    log_dir.mkdir(exist_ok=True)
    logger = setup_logging(log_dir)
    logger.info("Application started.")

    app = QApplication(sys.argv)
    app.setApplicationName("Work Tree")
    sys.excepthook = global_exception_hook

    work_tree = WorkTree()
    storage = Storage(work_tree, root_dir / "storage", 20)
    main_window = MainWindow(work_tree)
    main_window.show()

    mainwindow_hotkey_manager = HotkeyManager("hotkey/mainWindowHotkey", main_window)

    quit_signal.connect(app.quit)
    exit_code = app.exec_()

    # cleanup
    if mainwindow_hotkey_manager:
        mainwindow_hotkey_manager.cleanup()
        logger.info("Global listener stopped.")
    logger.info("Application quited.\n\n\n")
    sys.exit(exit_code)


