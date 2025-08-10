from PyQt5.QtWidgets import QWidget, QHBoxLayout, QMenuBar, QMessageBox, QFileDialog, QShortcut
from PyQt5.QtGui import QKeySequence
from PyQt5.QtCore import Qt, QEvent, pyqtSignal
from plyer import notification
from app.settings import settings_manager
from .graph import TreeGraphWidget
from .console import CommandWidget
from ..settings import settings_manager
from ..utils import set_app_state
from ..settings_window import SettingsDialog
from ..reminders_window import RemindersDialog

import logging

logger = logging.getLogger(__name__)

class MainWindow(QWidget):

    cleanup_history_signal = pyqtSignal()
    save_file_signal = pyqtSignal(str)
    open_file_signal = pyqtSignal(str)

    """
    combines TreeGraphWidget and CommandWidget together
    provides a menu bar
    """
    def __init__(self, work_tree):
        super().__init__()
        self.setWindowTitle("worktree")

        self.worktree = work_tree

        self.tree_graph_widget = TreeGraphWidget(work_tree)
        self.command_widget = CommandWidget(work_tree)
        self.main_layout = QHBoxLayout()
        self.main_layout.addWidget(self.tree_graph_widget, stretch=2)
        self.main_layout.addWidget(self.command_widget, stretch=3)
        self.main_layout.setContentsMargins(5,5,5,5)
        self.main_layout.setSpacing(5)

        self.menu_bar = QMenuBar()
        self.file_menu = self.menu_bar.addMenu('File')
        self.file_menu.addAction("Save as", self.save_file)
        self.file_menu.addAction("Open File", self.open_file)
        self.file_menu.addAction("Cleanup history", self.cleanup_history)
        self.reminder_menu = self.menu_bar.addMenu('Reminder')
        self.reminder_menu.addAction('Manage Reminder', self.open_reminder_dialog)
        self.settings_menu = self.menu_bar.addMenu("Settings")
        self.settings_menu.addAction("Open settings window", self.open_settings_window)
        self.settings_menu.addAction("Recover to default settings", settings_manager.recover_default)
        self.main_layout.setMenuBar(self.menu_bar)

        # hotkeys
        self.save_file_shortcut = QShortcut(QKeySequence(settings_manager.get("hotkey/saveFileHotkey", type=str)), self)
        self.save_file_shortcut.activated.connect(self.save_file)
        self.open_file_shortcut = QShortcut(QKeySequence(settings_manager.get("hotkey/openFileHotkey", type=str)), self)
        self.open_file_shortcut.activated.connect(self.open_file)
        settings_manager.settings_changed.connect(self.update_settings)

        # signal
        self.worktree.reminder_service.reminder_due.connect(self.on_reminder_due)
        
        self.setLayout(self.main_layout)
        self.setGeometry(300, 300, 500, 300)

        self.installEventFilter(self)
    
    def update_settings(self, keys):
        if "hotkey/saveFileHotkey" in keys:
            self.save_file_shortcut.setKey(QKeySequence(settings_manager.get("hotkey/saveFileHotkey", type=str)))
        if "hotkey/openFileHotkey" in keys:
            self.open_file_shortcut.setKey(QKeySequence(settings_manager.get("hotkey/openFileHotkey", type=str)))

    def to_frontground(self):
        self.show()
        self.raise_()
        self.activateWindow()
        self.command_widget.command_input.setFocus()
        # set_app_state(True)
        self.setWindowState(self.windowState() & ~Qt.WindowMinimized | Qt.WindowActive)

    def to_background(self):
        self.hide()
        # only one window here, so directly change the application policy
        # set_app_state(False)

    def toggle_state(self):
        if self.isVisible():
            logger.info("Hide window.")
            self.to_background()
        else:
            logger.info("Show window.")
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
    
    def open_settings_window(self):
        dialog = SettingsDialog(self)
        dialog.exec_()

    def open_reminder_dialog(self):
        dialog = RemindersDialog(self.worktree)
        ret = dialog.exec_()
        self.tree_graph_widget.relayout_tree()
    
    def cleanup_history(self):
        result = QMessageBox.warning(
            self,
            "Confirm Cleanup History",
            "Sure to clean up all the history? This operation is irreversible.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )
        if result == QMessageBox.Yes:
            self.cleanup_history_signal.emit()
            QMessageBox.information(
                self,
                "Cleanup History",
                "History has been cleaned up successfully.",
                QMessageBox.Ok,
            )
            
    def save_file(self):
        file_path, selected_filter = QFileDialog.getSaveFileName(parent=self, caption="Save Tree As",
                                                                 filter='*.zip', initialFilter='*.zip', options=QFileDialog.Options())
        if not file_path:
            return
        self.save_file_signal.emit(file_path)

    def open_file(self):
        result = QMessageBox.information(self, 'Hint',
                                'If you open a new file, the current save will be lost.\n Please save it.',
                                buttons= QMessageBox.Ok | QMessageBox.Cancel)
        if result == QMessageBox.Cancel:
            return
        
        file_path, selected_filter = QFileDialog.getOpenFileName(parent=self, caption="Open File",
                                                                 filter='*.zip', initialFilter='*.zip', options=QFileDialog.Options())
        if not file_path:
            return
        self.open_file_signal.emit(file_path)
