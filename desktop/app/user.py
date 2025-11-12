from PyQt5.QtCore import QObject, pyqtSignal
from pathlib import Path
import json, logging

LOCAL_USER = 'local'

class UserManager(QObject):
    user_change = pyqtSignal()

    def __init__(self, data_file: Path):
        super().__init__()
        self.data_file = data_file
        with open(self.data_file, 'r') as f:
            data = json.load(f) # we expect this loading to succeed
        self._user_id = data["user_id"]
        self._username = data["username"]

        self.user_change.connect(self.refresh_data_file)

        self.logger = logging.getLogger(__name__)
    
    def user_id(self):
        return self._user_id

    def username(self):
        return self._username

    def login(self, user_id: str, username: str):
        self.logger.info(f"Login to user {username} ({user_id})")
        self._user_id = user_id
        self._username = username
        self.user_change.emit()
    
    def logout(self):
        self.logger.info("Log out")
        self._user_id = LOCAL_USER
        self._username = LOCAL_USER
        self.user_change.emit()
    
    def refresh_data_file(self):
        with open(self.data_file, 'w') as f:
            json.dump({"user_id": self._user_id,
                       "username": self._username,}, f)