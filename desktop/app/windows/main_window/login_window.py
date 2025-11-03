from PyQt5.QtWidgets import QDialog, QLineEdit, QLabel, QPushButton, \
                            QVBoxLayout, QFormLayout, QMessageBox
import requests, json, logging

from app.setup import AppContext

logger = logging.getLogger(__name__)

class LoginWindow(QDialog):
    def __init__(self, context: AppContext, parent=None):
        super().__init__(parent)
        self.context = context

        self.resize(300, 150)
        self.setWindowTitle("Login")

        self.username_label = QLabel("Username:")
        self.username_input = QLineEdit(self)
        self.username_input.setPlaceholderText("Please input username")

        self.password_label = QLabel("Password:")
        self.password_input = QLineEdit(self)
        self.password_input.setPlaceholderText("Please input password")

        self.login_button = QPushButton("Login", self)
        self.cancel_button = QPushButton("Cancel", self)

        layout = QVBoxLayout(self)
        form_layout = QFormLayout()

        form_layout.addRow(self.username_label, self.username_input)
        form_layout.addRow(self.password_label, self.password_input)

        layout.addLayout(form_layout)
        layout.addWidget(self.login_button)
        layout.addWidget(self.cancel_button)

        self.login_button.clicked.connect(self.handle_login)
        self.cancel_button.clicked.connect(self.reject)

    def handle_login(self):
        username = self.username_input.text()
        password = self.password_input.text()

        payload = {"username": username, "password": password}
        headers = {"Content-Type": "application/json"}

        try:
            response = requests.post(self.context.settings_manager.get("internal/loginURL"),
                                     json=payload,
                                     headers=headers,
                                     timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                user_id = data.get("user_id")

                if user_id is None:
                    logger.error("Server Response does not contain field 'user_id'.")
                
                self.context.users_manager.login(user_id)
            
                QMessageBox.information(self, "Success",
                                        f"You have logged in '{username}' successfully!",
                                        QMessageBox.Ok, QMessageBox.Ok)
                self.accept()
            
            elif response.status_code == 401:
                QMessageBox.warning(self, "Warning",
                                    "Username or password is wrong.",
                                    QMessageBox.Ok, QMessageBox.Ok)

            else:
                QMessageBox.critical(self, "Error",
                                     "Unknown error happened, please report it.",
                                     QMessageBox.Ok, QMessageBox.Ok)
        
        except requests.exceptions.RequestException as e:
            QMessageBox.warning(self, "Error",
                                str(e),
                                QMessageBox.Ok, QMessageBox.Ok)


