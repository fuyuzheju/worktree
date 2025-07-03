from PyQt5.QtWidgets import QApplication, QSystemTrayIcon, QAction, QMenu, QWidget, QMessageBox
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import QStandardPaths
from pathlib import Path
import logging, shutil, os, zipfile, json

ICON_PATH = "worktree-icon.png"
logger = logging.getLogger(__name__)

STORAGE_DIR = ''
storage = None

def setup_tray_icon(connected_window: QWidget):
    from .controls import quit_signal
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

def quit_application(app):
    app.quit()

def setup_app(app):
    global storage, STORAGE_DIR
    from .main_window import MainWindow
    from .keyboard_listener import HotkeyManager
    from .data.tree import WorkTree
    from .data.storage import Storage
    from .settings import settings_manager
    from .controls import quit_signal

    STORAGE_DIR = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    STORAGE_DIR = Path(STORAGE_DIR) / "storage"
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    work_tree = WorkTree()
    storage = Storage(work_tree, STORAGE_DIR, 20)
    logger.debug(f"Storage configured. Dir: {STORAGE_DIR}")
    main_window = MainWindow(work_tree)
    main_window.show()
    logger.debug("Main window created.")

    main_window.cleanup_history_signal.connect(cleanup_history)
    main_window.save_file_signal.connect(save_tree)
    main_window.open_file_signal.connect(open_tree)

    if settings_manager.get("createTrayIcon", type=bool):
        tray_icon = setup_tray_icon(main_window)

    mainwindow_hotkey_manager = HotkeyManager("hotkey/mainWindowHotkey", main_window)
    logger.debug("Hotkey manager created.")

    quit_signal.connect(lambda: quit_application(app))
    logger.debug("Application Initialized.")

    return mainwindow_hotkey_manager

def cleanup_history():
    """
    clean up all the history.
    """
    if storage == None:
        return
    shutil.rmtree(STORAGE_DIR)
    STORAGE_DIR.mkdir()
    storage.history_dir.mkdir()
    storage.current_snapshot_dir = None
    storage.op_count_since_snapshot = 0
    storage.take_snapshot()
    logger.info("History cleaned up.")

def save_tree(output_path:str):
    if storage == None:
        return
    if output_path.endswith('.zip'):
        output_path = output_path[:-4]
    shutil.make_archive(output_path, 'zip', root_dir=STORAGE_DIR, 
                        base_dir='.')
    logger.debug(f'Save Tree to {output_path}')

def open_tree(filepath: str):
    if storage == None:
        return

    try:
        with zipfile.ZipFile(filepath, 'r') as f:
            contents = f.namelist()
    except zipfile.BadZipFile as e:
        QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
    except Exception as e:
        QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
    
    if os.path.exists(STORAGE_DIR):
        shutil.rmtree(STORAGE_DIR)
    if not os.path.exists(STORAGE_DIR):
        os.mkdir(STORAGE_DIR)   #clean storage

    shutil.unpack_archive(filepath, extract_dir=STORAGE_DIR)
    try:
        storage.current_snapshot_dir, storage.op_count_since_snapshot = storage.get_latest_snapshot()
        storage.load_from_disk()
        if storage.current_snapshot_dir == None:
            raise ValueError("No history snapshots found.")
    except Exception as e:
        QMessageBox.critical(None ,'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
        shutil.rmtree(STORAGE_DIR)
        os.mkdir(STORAGE_DIR)
