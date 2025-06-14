from PyQt5.QtWidgets import QApplication
from app.window import MainWindow
from app.keyboard_listener import HotkeyManager
from datetime import datetime
from pathlib import Path
from logging.handlers import RotatingFileHandler
import sys, traceback, logging
from app.data.tree import WorkTree

HOTKEY = '<ctrl>+f'

def global_exception_hook(exctype, value, tb):
    logging.error("Traceback:")
    traceback.print_tb(tb)
    logging.error("An unhandled exception occurred, " + str(exctype) + str(value))

def setup_logging():
    if getattr(sys, 'frozen', False):
        log_dir = Path(sys.executable).parent.parent.parent / "logs"
        log_dir.mkdir(exist_ok=True)
    else:
        log_dir = Path(__file__).parent / "logs"
        log_dir.mkdir(exist_ok=True)
            
    log_file = log_dir / "app.log"

    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    if logger.hasHandlers():
        logger.handlers.clear()

    handler = RotatingFileHandler(
        log_file, maxBytes=5*1024*1024, backupCount=2, encoding='utf-8'
    )

    formatter = logging.Formatter('--- %(asctime)s ---\n## %(levelname)s ## %(name)s: %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    logging.info("Logging configured successfully. Log file: %s", log_file)

if __name__ == '__main__':
    setup_logging()
    logging.info("\n\n\nApplication started.")

    app = QApplication(sys.argv)
    app.setApplicationName("Work Tree")
    sys.excepthook = global_exception_hook

    work_tree = WorkTree()
    main_window = MainWindow(work_tree)
    main_window.show()

    hotkey_manager = HotkeyManager(HOTKEY, main_window)

    exit_code = app.exec_()

    if hotkey_manager:
        logging.info("Trying to stop global listener.")
        hotkey_manager.cleanup()
    
    logging.info("Application quited.")

    sys.exit(exit_code)


