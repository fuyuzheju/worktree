from PyQt5.QtWidgets import QApplication
from app.window import MainWindow
from app.keyboard_listener import HotkeyManager
from datetime import datetime
from pathlib import Path
from logging.handlers import RotatingFileHandler
import sys, traceback, logging

HOTKEY = '<ctrl>+f'

def global_exception_hook(exctype, value, tb):
    logging.error("Traceback:")
    traceback.print_tb(tb)
    logging.error("An unhandled exception occurred, " + str(exctype) + str(value))

def setup_logging():
    # log_dir = Path.home() / "Library" / "Logs" / "worktree"
    # try:
    #     log_dir.mkdir(parents=True, exist_ok=True)
    # except Exception as e:
    #     print(f"Could not create log directory: {e}")
        # 在这种极端情况下，退回到应用旁边
    if getattr(sys, 'frozen', False):
        log_dir = Path(sys.executable).parent.parent.parent / "logs"
        log_dir.mkdir(exist_ok=True)
    else:
        log_dir = Path(__file__).parent / "logs"
        log_dir.mkdir(exist_ok=True)
            
    log_file = log_dir / "app.log"

    # 获取根记录器
    logger = logging.getLogger()
    logger.setLevel(logging.INFO) # 设置你想要的最低级别

    # 移除任何可能存在的默认处理器
    if logger.hasHandlers():
        logger.handlers.clear()

    handler = RotatingFileHandler(
        log_file, maxBytes=5*1024*1024, backupCount=2, encoding='utf-8'
    )

    formatter = logging.Formatter('--- %(asctime)s ---\n## %(levelname)s ## %(name)s: %(message)s')
    handler.setFormatter(formatter)

    logger.addHandler(handler)

    # def handle_exception(exc_type, exc_value, exc_traceback):
    #     if issubclass(exc_type, KeyboardInterrupt):
    #         sys.__excepthook__(exc_type, exc_value, exc_traceback)
    #         return
    #     logging.critical("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

    # sys.excepthook = handle_exception
    
    logging.info("Logging configured successfully. Log file: %s", log_file)

if __name__ == '__main__':
    setup_logging()
    logging.info("\n\n\nApplication started.")

    app = QApplication(sys.argv)
    app.setApplicationName("Work Tree")
    sys.excepthook = global_exception_hook

    main_window = MainWindow()
    main_window.show()

    hotkey_manager = HotkeyManager(HOTKEY, main_window)

    exit_code = app.exec_()

    if hotkey_manager:
        logging.info("Trying to stop global listener.")
        hotkey_manager.cleanup()
    
    logging.info("Application quited.")

    sys.exit(exit_code)


