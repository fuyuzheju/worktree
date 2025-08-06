from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QTableWidget, QHBoxLayout, QPushButton,
                             QTableWidgetItem, QCheckBox, QMessageBox, QDialog, QLabel,
                             QLineEdit, QDateTimeEdit) 
from ..data.reminder import ReminderService, Reminder
from ..data import WorkTree
from PyQt5.QtCore import QDateTime, Qt
from functools import partial
import datetime

class SetReminderDialog(QDialog):

    def __init__(self, node , worktree: WorkTree ,
                 current_reminder: Reminder | None = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f'Set Reminder On {node.name}')
        self.setFixedSize(300, 180)

        self.worktree = worktree
        self.reminder_service = worktree.reminder_service
        self.current_reminder = current_reminder
        self.node = node

        self.setup_init()

    def setup_init(self):
        if self.current_reminder != None:
            cur_time = self.current_reminder.due_time
            active = self.current_reminder.active
            message = self.current_reminder.message
        else:
            cur_time = QDateTime.currentDateTime()
            active = True
            message = ''

        layout = QVBoxLayout()
        active_layout = QHBoxLayout()
        self.active_checkbox = QCheckBox("Active", self)
        self.active_checkbox.setChecked(active)
        active_layout.addWidget(self.active_checkbox)
        layout.addLayout(active_layout)

        time_layout = QHBoxLayout()
        time_layout.addWidget(QLabel("Due Time: "))
        self.trigger_time_input = QDateTimeEdit(self)
        self.trigger_time_input.setDisplayFormat("MM-dd HH:mm")
        self.trigger_time_input.setDateTime(cur_time)
        time_layout.addWidget(self.trigger_time_input)
        layout.addLayout(time_layout)

        desc_layout = QHBoxLayout()
        desc_layout.addWidget(QLabel("Message:"))
        self.description_input = QLineEdit(self)
        self.description_input.setText(message)
        desc_layout.addWidget(self.description_input)
        layout.addLayout(desc_layout)

        button_layout = QHBoxLayout()
        self.ok_button = QPushButton("Save", self)
        self.ok_button.clicked.connect(self.save_set_result)
        button_layout.addWidget(self.ok_button)

        self.cancel_button = QPushButton("Cancel", self)
        self.cancel_button.clicked.connect(self.reject)
        button_layout.addWidget(self.cancel_button)
        layout.addLayout(button_layout)

        self.setLayout(layout)

    def get_reminder_data(self) :
        is_active = self.active_checkbox.isChecked()
        due_time_q = self.trigger_time_input.dateTime().toString(Qt.ISODateWithMs)
        due_time = datetime.datetime.fromisoformat(due_time_q)        
        message = self.description_input.text()
        if not message:
            return None, None, None
        return is_active, due_time, message
    
    def save_set_result(self):
        is_active, duetime, message = self.get_reminder_data()
        if is_active is not None and duetime and message:
            if self.current_reminder == None:
                self.worktree.add_reminder(self.node.identity, duetime, message, None, is_active)
            else:
                self.worktree.set_reminder(self.current_reminder.reminder_id, duetime, message, is_active)
        self.accept()

class RemindersDialog(QDialog):

    def __init__(self, worktree: 'WorkTree'):
        super().__init__()
        self.setWindowTitle('Reminder Manage')
        self.setGeometry(300, 300, 1000, 300)

        self.worktree = worktree
        self.reminder_service = worktree.reminder_service
        self.uid_list = []

        self.setup_ui()
        self.refresh()

    def setup_ui(self):
        main_layout = QVBoxLayout()

        self.reminder_table = QTableWidget(self)
        self.reminder_table.setColumnCount(5)
        self.reminder_table.setHorizontalHeaderLabels(["Activate","Time", "Message",'Set' ,"Delete"])
        self.reminder_table.setColumnWidth(0, 80)
        self.reminder_table.setColumnWidth(1, 150) 
        self.reminder_table.setColumnWidth(2, 500)
        self.reminder_table.setColumnWidth(3, 80)
        self.reminder_table.setColumnWidth(4, 80) 
        self.reminder_table.verticalHeader().setVisible(False)
        self.reminder_table.setSelectionBehavior(QTableWidget.SelectRows)

        main_layout.addWidget(self.reminder_table)

        button_layout = QHBoxLayout()

        self.exit_button = QPushButton("Save and Exit", self)
        self.exit_button.clicked.connect(self.accept)
        button_layout.addWidget(self.exit_button)

        main_layout.addLayout(button_layout)

        self.setLayout(main_layout)

    def _add_event_to_table(self, activate : bool, trigger_time: datetime, description: str):
        row_position = self.reminder_table.rowCount()
        self.reminder_table.insertRow(row_position)

        active_checkbox = QCheckBox(self)
        active_checkbox.setChecked(activate)
        active_checkbox.stateChanged.connect(partial(self.update_active_status, row_position))
        self.reminder_table.setCellWidget(row_position, 0, active_checkbox)

        self.reminder_table.setItem(row_position, 1, QTableWidgetItem(str(trigger_time)))
        self.reminder_table.setItem(row_position, 2, QTableWidgetItem(description))

        set_button = QPushButton('Set', self)
        set_button.clicked.connect(partial(self.set_reminder, row_position))
        self.reminder_table.setCellWidget(row_position, 3, set_button)

        delete_button = QPushButton("Delete", self)
        delete_button.clicked.connect(partial(self.delete_reminder, row_position))
        self.reminder_table.setCellWidget(row_position, 4, delete_button)

    def set_reminder(self, row_position):
        node_id = self.reminder_service.get_reminder_by_id(self.uid_list[row_position]).node_id
        node = self.worktree.tree.get_node_by_id(node_id)
        current_id = self.uid_list[row_position]
        current_reminder = self.reminder_service.get_reminder_by_id(current_id)
        set_dialog = SetReminderDialog(node, self.worktree, current_reminder)
        ret = set_dialog.exec_()
        self.refresh()

    def refresh(self):
        self.reminder_table.setRowCount(0)
        self.uid_list = []
        for reminder_event in self.reminder_service.reminders: 
            self._add_event_to_table(reminder_event.active ,reminder_event.due_time , reminder_event.message)
            self.uid_list.append(reminder_event.reminder_id)
    
    def delete_reminder(self, row_position):
        reply = QMessageBox.question(self, "Delete Recheck", "Sure to delete the reminder?",
                                     QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply == QMessageBox.Yes:
            reminder_id = self.uid_list[row_position]
            self.worktree.remove_reminder(reminder_id)
            self.refresh()
    
    def update_active_status(self, data_store_index, state):
        if 0 <= data_store_index < len(self.reminder_service.reminders):
            self.worktree.set_reminder(self.uid_list[data_store_index], active=(state==Qt.Checked))