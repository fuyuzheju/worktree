from PyQt5.QtWidgets import QWidget, QHBoxLayout
from PyQt5.QtCore import Qt, QEvent
from .graph import TreeGraphWidget
from .console import CommandWidget
from ..utils import set_app_state
import logging

class MainWindow(QWidget):
    def __init__(self, work_tree):
        super().__init__()
        self.setWindowTitle("Tree Edit App")

        self.tree_graph_widget = TreeGraphWidget(work_tree)
        self.command_widget = CommandWidget(work_tree)
        self.main_layout = QHBoxLayout()
        self.main_layout.addWidget(self.tree_graph_widget, stretch=2)
        self.main_layout.addWidget(self.command_widget, stretch=3)
        self.main_layout.setContentsMargins(5,5,5,5)
        self.main_layout.setSpacing(5)
        self.setLayout(self.main_layout)
        self.setGeometry(300, 300, 500, 300)

        self.installEventFilter(self)

    def to_frontground(self):
        self.show()
        self.raise_()
        self.activateWindow()
        self.command_widget.command_input.setFocus()
        set_app_state(True)
        self.setWindowState(self.windowState() & ~Qt.WindowMinimized | Qt.WindowActive)

    def to_background(self):
        self.hide()
        # only one window here, so directly change the application policy
        set_app_state(False)

    def toggle_state(self):
        if self.isVisible():
            logging.info("Hide window.")
            self.to_background()
        else:
            logging.info("Show window.")
            self.to_frontground()

    def closeEvent(self, event):
        self.to_background()
        event.ignore()
    
    def eventFilter(self, obj, event):
        if event.type() == QEvent.KeyPress:
            if event.key() == Qt.Key_Enter or event.key() == Qt.Key_Return:
                if not self.command_widget.command_input.hasFocus():
                    self.command_widget.command_input.setFocus()
                    return True
        return super().eventFilter(obj, event)
