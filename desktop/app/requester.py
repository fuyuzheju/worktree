# this is a middleware which processes all requests
# this middleware also saves the JWT, and processes login and logout

from PyQt5.QtCore import QObject, pyqtSignal, pyqtSlot, QSemaphore
from PyQt5.QtWidgets import (QMessageBox, QLabel, QVBoxLayout,
                             QDialog, QLineEdit, QDialogButtonBox, QFormLayout)
from pathlib import Path
from typing import Optional
from app.user import UserManager, LOCAL_USER
from app.globals import context
from app.history.core import Operation
import websockets, requests, aiohttp, asyncio

class Requester(QObject):
    """
    Requester proxys all the requests to server, processing
    authorization and other complexities.
    Running on main thread(because it calls GUI).
    """

    def __init__(self,
                 user_manager: UserManager,
                 data_file: Path):
        super().__init__()
        self.user_manager = user_manager
        self.data_file = data_file
        self.user_manager.user_change.connect(self.on_user_change)
        with open(self.data_file, 'r') as f:
            self.access_token = f.read()
        if self.access_token == "":
            self.user_manager.logout()
    
    def on_user_change(self):
        if self.user_manager.username() == LOCAL_USER:
            # delete the JWT
            self.access_token = ""
            with open(self.data_file, 'w') as f:
                f.write(self.access_token)

    async def health_check(self):
        # mock the offline status when logged out
        if self.access_token == "":
            return False
        url = context.settings_manager.get("internal/healthCheckURL")
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    return response.status == 200
        except Exception as e:
            return False
    
    def overwrite(self, starting_serial_num: int, operations: list[Operation]):
        raise NotImplementedError()
    
    def build_websocket_connection(self):
        """
        This method must be called in the subthread(in a subthread worker),
        so that the returned websocket_connector also belongs to subthread.
        This is not async function because it directly returns a coroutine,
        so we can use `async with` to interact with the return value
        """
        uri = context.settings_manager.get("internal/websocketURI", type=str)
        websocket_connector = WebsocketConnector(uri, self, self.user_manager)
        return websocket_connector
    
    @pyqtSlot(QSemaphore)
    def request_login(self, semaphore: Optional[QSemaphore] = None):
        """
        this method must be run on the main thread.
        you can provide a semaphore to know what time this method returns
        """
        username, password, status = LoginRequestDialog.get_data()
        if status == False:
            self.user_manager.logout()
            self.access_token = ""
            with open(self.data_file, 'w') as f:
                f.write(self.access_token)
        else:
            code, message = self.login(username, password)
            if code == -1:
                QMessageBox.warning(None, "Fail", message,
                                    QMessageBox.Ok, QMessageBox.Ok)
                return
            elif code == 1:
                QMessageBox.warning(None, "Fail", message,
                                    QMessageBox.Ok, QMessageBox.Ok)
                self.request_login() # let the user try again
            elif code == 0:
                pass
        
        if semaphore is not None:
            semaphore.release()

    def login(self, username, password):
        try:
            response = requests.post(
                context.settings_manager.get("internal/loginURL"),
                json={
                    "username": username,
                    "password": password,
            })
        except requests.exceptions.ConnectionError as e:
            return -1, "Network Error"

        if response.status_code == 200:
            data = response.json()
            self.user_manager.login(data["user_id"], username)
            self.access_token = data["access_token"]
            with open(self.data_file, 'w') as f:
                f.write(self.access_token)
            return 0, "Success"
        else:
            data = response.json()
            return 1, data["message"]


class WebsocketConnector(QObject):
    """
    websocket connector runs on the subthread
    """
    request_login = pyqtSignal(QSemaphore)

    def __init__(self,
                 uri: str,
                 requester: Requester,
                 user_manager: UserManager):
        super().__init__()
        self.uri = uri
        self.requester = requester
        self.user_manager = user_manager
        self.user_manager.user_change.connect(self.on_user_change)
        
        uri = self.uri + f"?token={self.requester.access_token}"
        self.connection = websockets.connect(uri)
        self.socket = None

        self.request_login.connect(self.requester.request_login)
    
    def on_user_change(self):
        if self.socket is not None:
            asyncio.create_task(self.socket.close(1000))
    
    async def __aenter__(self):
        try:
            if self.requester.access_token == "":
                raise websockets.exceptions.ConnectionClosed(None, None)
            self.socket = await self.connection
            await self.socket.recv()
            print("here")
        except websockets.exceptions.ConnectionClosed as e:
            if self.socket is None:
                raise e
            if self.socket.close_code != 4001: # auth failed code
                raise e
                
            semaphore = QSemaphore(0)
            self.request_login.emit(semaphore)
            semaphore.acquire()
            if self.requester.access_token == "":
                raise websockets.exceptions.ConnectionClosed(None, None)

            # reset all connections
            uri = self.uri + f"?token={self.requester.access_token}"
            self.connection = websockets.connect(self.uri)
            self.socket = await self.connection
        
        return self.socket

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.connection.__aexit__(exc_type, exc_val, exc_tb)


class LoginRequestDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)

        self.setWindowTitle("Login")

        self.username_label = QLabel("username:")
        self.username_edit = QLineEdit()
        self.password_label = QLabel("password:")
        self.password_edit = QLineEdit()

        self.button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)

        form_layout = QFormLayout()
        form_layout.addRow(self.username_label, self.username_edit)
        form_layout.addRow(self.password_label, self.password_edit)

        main_layout = QVBoxLayout()
        main_layout.addLayout(form_layout)
        main_layout.addWidget(self.button_box)

        self.setLayout(main_layout)

    @staticmethod
    def get_data(parent=None):
        dialog = LoginRequestDialog(parent)
        result = dialog.exec_()

        if result == QDialog.Accepted:
            username = dialog.username_edit.text()
            password = dialog.password_edit.text()
            return username, password, True
        
        return "", "", False
