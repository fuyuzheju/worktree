from pathlib import Path
from .storage import Storage
from .core import ExtOperation, ExtOperationType
import time

from app.setup import AppContext

class UsersManager:
    def __init__(self, context: AppContext, root_dir: Path):
        self.current_user = 'local'
        self.root_dir = root_dir
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.context = context
        self.storage = Storage(context, self.root_dir / self.current_user)
    
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
        self.setup()
        return 0
    
    def logout(self):
        if not self.is_logged_in():
            return -1
        self.current_user = 'local'
        self.setup()
        return 0
