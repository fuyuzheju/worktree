from PyQt5.QtWidgets import (
    QDialog, QVBoxLayout, QTabWidget, QWidget, QFormLayout,
    QLineEdit, QSpinBox, QDoubleSpinBox, QPushButton, QDialogButtonBox,
    QColorDialog, QFontComboBox, QKeySequenceEdit, QCheckBox
)
from PyQt5.QtGui import QColor, QPalette, QKeySequence
from PyQt5.QtCore import Qt
from ..settings import settings_manager, DEFAULT_SETTINGS

class SettingsDialog(QDialog):
    """
    A Dialog to view and edit settings.
    Dynamically generate tab pages and editors according to settings.
    """
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("应用设置")
        self.setMinimumWidth(450)
        self.setModal(True)

        # store all editor buttons
        self.editors = []

        main_layout = QVBoxLayout(self)

        # tab pages: for every group of settings
        self.tabs = QTabWidget(self)
        main_layout.addWidget(self.tabs)

        self.setup_ui()

        button_box = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        main_layout.addWidget(button_box)

    def setup_ui(self):
        """
        dynamically create ui elements based on DEFAULT_SETTINGS
        """
        groups = {}

        for key, default_value in DEFAULT_SETTINGS.items():

            # analyze the key for its group name
            if "/" in key:
                group_name, setting_name = key.split("/", 1)
            else:
                group_name, setting_name = "general", key # to "general" group if this doesn't belong to any group

            if group_name not in groups:
                # new tab page
                tab_page = QWidget()
                form_layout = QFormLayout(tab_page)
                self.tabs.addTab(tab_page, group_name.capitalize())
                groups[group_name] = form_layout

            current_value = settings_manager.get(key, type=type(default_value))
            label_text = setting_name.replace('_', ' ').capitalize()
            
            editor = None

            if isinstance(default_value, bool):
                editor = QCheckBox()
                editor.setChecked(current_value)
            elif isinstance(default_value, int):
                editor = QSpinBox()
                editor.setRange(-10000, 10000)
                editor.setValue(current_value)
            elif isinstance(default_value, float):
                editor = QDoubleSpinBox()
                editor.setRange(-10000.0, 10000.0)
                editor.setDecimals(2)
                editor.setValue(current_value)
            elif isinstance(default_value, QColor):
                editor = self._create_color_button(current_value)
            elif key.lower().startswith('hotkey/'):
                editor = QKeySequenceEdit()
                editor.setKeySequence(QKeySequence(current_value))
            elif key.lower().endswith('fontfamily'):
                editor = QFontComboBox()
                editor.setCurrentText(current_value)
            elif isinstance(default_value, str):
                editor = QLineEdit(current_value)
            
            if editor:
                self.editors.append((key, editor))
                groups[group_name].addRow(label_text, editor)

    def _create_color_button(self, initial_color: QColor):
        """
        create a color choice button
        """
        button = QPushButton(initial_color.name())
        button.setProperty("currentColor", initial_color)
        self._update_button_style(button, initial_color)

        button.clicked.connect(lambda: self._on_color_button_clicked(button))
        return button

    def _update_button_style(self, button, color: QColor):
        button.setText(color.name())
        button.setStyleSheet(f"background-color: {color.name()};")
        palette = button.palette()
        if color.lightness() < 128:
            palette.setColor(QPalette.ButtonText, Qt.white)
        else:
            palette.setColor(QPalette.ButtonText, Qt.black)
        button.setPalette(palette)

    def _on_color_button_clicked(self, button):
        """
        open the color dialog when color button is clicked
        """
        current_color = button.property("currentColor")
        new_color = QColorDialog.getColor(current_color, self, "选择颜色")
        if new_color.isValid():
            button.setProperty("currentColor", new_color)
            self._update_button_style(button, new_color)
    
    def accept(self):
        """
        when "OK" is clicked, save all the changed settings and set it to settings_manager
        """
        keys_to_set = []
        values_to_set = []

        for key, editor in self.editors:
            if isinstance(editor, QCheckBox):
                value = editor.isChecked()
            elif isinstance(editor, QSpinBox) or isinstance(editor, QDoubleSpinBox):
                value = editor.value()
            elif isinstance(editor, QKeySequenceEdit):
                value = editor.keySequence().toString()
            elif isinstance(editor, QLineEdit):
                value = editor.text()
            elif isinstance(editor, QFontComboBox):
                value = editor.currentFont().family()
            elif isinstance(editor, QPushButton) and editor.property("currentColor"):
                value = editor.property("currentColor")
            else:
                continue

            keys_to_set.append(key)
            values_to_set.append(value)
        
        if keys_to_set:
            settings_manager.set(keys_to_set, values_to_set)

        super().accept()
