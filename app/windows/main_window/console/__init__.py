from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QTextEdit, QLabel
from PyQt5.QtGui import QTextCursor
from PyQt5.QtCore import QObject, pyqtSignal, Qt, QEvent
from app.shell import Shell
import logging

from app.data.worktree import WorkTree
from app.data.worktree.tree import Node
from app.setup import AppContext
from typing import Optional

logger = logging.getLogger(__name__)

COMMAND_HISTORY_LENGTH = 300


class CommandLineEdit(QLineEdit):
    """
    the command line edit widget
    the user inputs commands here
    hotkeys:
    - up arrow: browse command history up
    - down arrow: browse command history down
    """
    def __init__(self, shell: Shell, parent=None):
        super().__init__(parent)
        self.command_history: list[str] = []
        self.current_command_index = 0

        self.is_completing = False # to record if the user is trying to complete the command
        self.completion_index = -1 # to record the current completion index
        self.possible_completion_list: list[str] = []
        self.shell: Shell = shell
        self.textChanged.connect(self.on_changed)
        self.cursorPositionChanged.connect(self.on_changed)
    
    def event(self, event):
        # keyPressEvent function can't capture the tab key's press, due to the default mechanism of QT.
        # QT will capture this event and set the focus to the next widget when the tab key is pressed.
        # So we need to override the event function to capture the tab key's press previously and accept it.
        if event.type() == QEvent.KeyPress and event.key() == Qt.Key_Tab:
            if self.is_completing:
                self.next_completion()
            
            else:
                self.start_completion()

            return True
        
        return super().event(event)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_Up:
            # command history browse
            self.current_command_index -= 1
            if not self.command_history:
                command = ''
            else:
                if self.current_command_index < 0:
                    self.current_command_index = 0
                command = self.command_history[self.current_command_index]
            self.setText(command)
            self.setCursorPosition(len(command))
            return

        elif event.key() == Qt.Key_Down:
            # command history browse
            self.current_command_index += 1
            if not self.command_history:
                command = ''
            else:
                if self.current_command_index >= len(self.command_history):
                    self.current_command_index = len(self.command_history)
                    command = ''
                else:
                    command = self.command_history[self.current_command_index]
            self.setText(command)
            self.setCursorPosition(len(command))
            return
        
        return super().keyPressEvent(event)
    
    def on_changed(self, *args):
        self.is_completing = False
        self.completion_index = -1
        self.possible_completion_list = []
    
    def update_history(self, command: str) -> None:
        self.command_history.append(command)
        self.current_command_index = len(self.command_history)
        if len(self.command_history) > COMMAND_HISTORY_LENGTH:
            self.command_history = self.command_history[-COMMAND_HISTORY_LENGTH:]
        
    def set_current_argument(self, arg_value: str) -> None:
        """
        complete the currently operated argument to {arg_value}
        """
        self.blockSignals(True) # avoid textChanged signal emit
        try:
            cursorp = self.cursorPosition()
            command = self.text()
            i = cursorp - 1
            while i >= 0 and command[i] != ' ':
                i -= 1
            i += 1 # now i is the start position of the current argument
            self.setText(command[:i] + arg_value + command[cursorp:])
            self.setCursorPosition(i + len(arg_value))
        finally:
            self.blockSignals(False)
    
    def next_completion(self):
        """
        complete to the next completion in the possible completion list
        """
        if len(self.possible_completion_list) == 0:
            return 

        self.completion_index = (self.completion_index + 1) % len(self.possible_completion_list)
        # complete to next completion
        self.set_current_argument(self.possible_completion_list[self.completion_index])
    
    def start_completion(self):
        """
        start completion:
        jump to the first completion(usually max common prefix of the possible completion list)
        provided by the 'auto_complete' method of shell.
        """
        # start completion
        incomplete_command = self.text()[:self.cursorPosition()]
        res = self.shell.auto_complete(incomplete_command)
        if res[0] is None:
            return
        
        if len(res[1]) == 1:
            # only 1 possibility
            # directly complete and add a space, making it ready to input the next argument
            # no need to set self.is_completing
            self.set_current_argument(res[0] + ' ')
            return
        
        self.is_completing = True
        mcp, self.possible_completion_list = res
        self.set_current_argument(mcp)


class CommandWidget(QWidget):
    """
    Main widget of the console, including a command input area and a output area.
    """
    def __init__(self, context: AppContext, parent=None):
        super().__init__(parent)
        self.shell = Shell(context)
        self.command_input = CommandLineEdit(self.shell)
        self.initUI()
        self.shell.output_signal.connect(self.output_callback)
        self.shell.error_signal.connect(self.error_callback)
        self.shell.finish_signal.connect(self.finish_callback)

    def initUI(self):
        self.Vlayout = QVBoxLayout()
        self.Hlayout = QHBoxLayout()
        self.setLayout(self.Vlayout)

        self.output_area = QTextEdit()
        self.output_area.setReadOnly(True)
        self.output_area.insertPlainText("> ")
        self.Vlayout.addWidget(self.output_area)

        self.command_label = QLabel(f"({self.shell.pwd}):")
        self.Hlayout.addWidget(self.command_label)
        self.command_input.returnPressed.connect(self.input_command)
        self.Hlayout.addWidget(self.command_input)
        self.Vlayout.addLayout(self.Hlayout)
    
    def output_callback(self, output: str) -> None:
        self.output_area.moveCursor(QTextCursor.End)
        self.output_area.insertPlainText(output)
    
    def error_callback(self, error: str) -> None:
        self.output_area.moveCursor(QTextCursor.End)
        self.output_area.insertPlainText(error)
    
    def finish_callback(self) -> None:
        self.output_area.moveCursor(QTextCursor.End)
        self.command_input.setReadOnly(False)
        self.command_input.setFocus()
        self.command_label.setText(f"({self.shell.pwd}):")
        self.output_area.insertPlainText("> ")    

    def input_command(self):
        if self.shell.is_running_command:
            return -1
        command = self.command_input.text()
        self.output_area.moveCursor(QTextCursor.End)
        self.output_area.insertPlainText(command + '\n')
        self.command_input.clear()
        self.command_input.update_history(command)
        self.command_input.setReadOnly(True)

        self.shell.run_command(command)
        return 0


# if __name__ == "__main__":
#     import sys
#     from PyQt5.QtWidgets import QApplication
#     from tree import TreeGraphWidget
#     app = QApplication(sys.argv)
#     tree_graph_widget = TreeGraphWidget()
#     command_widget = CommandWidget(tree_graph_widget)
#     command_widget.show()
#     sys.exit(app.exec_())