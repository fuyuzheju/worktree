from PyQt5.QtCore import QObject, pyqtSignal

LOCAL_USER = 'local'

class UserManager(QObject):
    user_change = pyqtSignal()

    def __init__(self):
        self._user_id = LOCAL_USER
        self._username = LOCAL_USER
    
    def user_id(self):
        return self._user_id

    def username(self):
        return self._username

    def login(self, user_id: str, username: str):
        self._user_id = user_id
        self._username = username
        self.user_change.emit()
    
    def logout(self, user_id: str, username:str):
        self._user_id = LOCAL_USER
        self._username = LOCAL_USER
        self.user_change.emit()