from PyQt5.QtWidgets import QMessageBox
from pathlib import Path
from .storage import Storage
from .core import ExtOperation, ExtOperationType
import time, logging, zipfile, shutil, os

from app.setup import AppContext

logger = logging.getLogger(__name__)

class UsersManager:
    def __init__(self, context: AppContext, root_dir: Path):
        self.current_user = 'local'
        self.root_dir = root_dir
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.storage_dir = self.root_dir / self.current_user
        self.context = context
        self.storage = Storage(context, self.storage_dir)
    
    def setup(self):
        self.storage.reload(self.root_dir / self.current_user)
        self.context.work_tree.tree_edit_signal.emit(ExtOperation.from_dict({
            "op_type": ExtOperationType.FLUSH.value,
            "payload": {},
            "timestamp": int(time.time()),
        }))
    
    def get_current_user(self):
        if self.current_user == 'local':
            return None
        return self.current_user

    def is_logged_in(self):
        return self.current_user != 'local'
    
    def login(self, user_id):
        if self.is_logged_in():
            return -1
        self.current_user = user_id
        self.storage_dir = self.root_dir / self.current_user
        self.setup()
        return 0
    
    def logout(self):
        if not self.is_logged_in():
            return -1
        self.current_user = 'local'
        self.storage_dir = self.root_dir / self.current_user
        self.setup()
        return 0

    def save_tree(self, output_path: str):
        if self.storage is None:
            return
        if output_path.endswith('.zip'):
            output_path = output_path[:-4]
        shutil.make_archive(output_path, 'zip', root_dir=self.storage_dir, base_dir='.')
        logger.debug(f"Save Tree to {output_path}")

    def open_tree(self, filepath: str):
        if self.storage is None:
            return

        try:
            with zipfile.ZipFile(filepath, 'r') as f:
                contents = f.namelist()

        except Exception as e:
            QMessageBox.critical(None, 'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)

        if os.path.exists(self.storage_dir):
            shutil.rmtree(self.storage_dir)
        if not os.path.exists(self.storage_dir):
            os.mkdir(self.storage_dir)

        shutil.unpack_archive(filepath, extract_dir=self.storage_dir)
        try:
            self.storage.history_storage.reload()
            self.storage.history_storage.load_tree()
            print("1")
            self.context.work_tree.tree_edit_signal.emit(ExtOperation.from_dict({
                "op_type": ExtOperationType.FLUSH.value,
                "payload": {},
                "timestamp": int(time.time()),
            }))
        
        except Exception as e:
            QMessageBox.critical(None, 'Invalid File', f'Input file {filepath} is invalid\nError message: {str(e)}', QMessageBox.Ok)
            shutil.rmtree(self.storage_dir)
            os.mkdir(self.storage_dir)

