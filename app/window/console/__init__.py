from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QTextEdit, QLabel
from PyQt5.QtCore import QObject, pyqtSignal, Qt
from .commands import COMMAND_REGISTRY

COMMAND_HISTORY_LENGTH = 300

class TreeController(QObject):
    output_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    finish_signal = pyqtSignal()

    def __init__(self, work_tree: "WorkTree") -> None:
        super().__init__()
        self.is_running_command = False
        self.work_tree = work_tree
    
    def run_command(self, command: str) -> int:
        """
        run the command and return the output as a parameter to the callback function.
        :return: 0 for success, -1 for command error, 1 for invalid command
        """
        parts = command.split()
        if len(parts) == 0:
            self.finish_signal.emit()
            return 0
        
        command_str = parts[0]
        command_class = COMMAND_REGISTRY.get(command_str)
        if command_class is None:
            self.error_signal.emit("Error: Invalid command.\n")
            self.finish_signal.emit()
            return 1

        command = command_class(*parts[1:])
        # print(type(command), dir(command))
        command.output_signal.connect(self.output_signal.emit)
        command.error_signal.connect(self.error_signal.emit)
        command.finish_signal.connect(self.finish_signal.emit)
        return command(self.work_tree)


class CommandLineEdit(QLineEdit):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.command_history = []
        self.current_command_index = 0

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_Up:
            self.current_command_index -= 1
            if not self.command_history:
                command = ''
            else:
                if self.current_command_index < 0:
                    self.current_command_index = 0
                command = self.command_history[self.current_command_index]
            self.setText(command)
        elif event.key() == Qt.Key_Down:
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
        
        return super().keyPressEvent(event)
    
    def update_history(self, command):
        self.command_history.append(command)
        self.current_command_index = len(self.command_history)
        if len(self.command_history) > COMMAND_HISTORY_LENGTH:
            self.command_history = self.command_history[-COMMAND_HISTORY_LENGTH:]

class CommandWidget(QWidget):
    def __init__(self, work_tree, parent=None):
        super().__init__(parent)
        self.work_tree = work_tree
        self.initUI()
        self.tree_controller = TreeController(work_tree)
        self.tree_controller.output_signal.connect(self.output_callback)
        self.tree_controller.error_signal.connect(self.error_callback)
        self.tree_controller.finish_signal.connect(self.finish_callback)

    def initUI(self):
        self.Vlayout = QVBoxLayout()
        self.Hlayout = QHBoxLayout()
        self.setLayout(self.Vlayout)

        self.output_area = QTextEdit()
        self.output_area.setReadOnly(True)
        self.output_area.insertPlainText("> ")
        self.Vlayout.addWidget(self.output_area)

        self.command_label = QLabel(f"({self.work_tree.current_node.name}):")
        self.Hlayout.addWidget(self.command_label)
        self.command_input = CommandLineEdit()
        self.command_input.returnPressed.connect(self.input_command)
        self.Hlayout.addWidget(self.command_input)
        self.Vlayout.addLayout(self.Hlayout)
    
    def output_callback(self, output):
        self.output_area.insertPlainText(output)
    
    def error_callback(self, error):
        self.output_area.insertPlainText(error)
    
    def finish_callback(self):
        self.command_input.setReadOnly(False)
        self.command_input.setFocus()
        self.command_label.setText(f"({self.work_tree.current_node.name}):")
        self.output_area.insertPlainText("> ")    

    def input_command(self):
        if self.tree_controller.is_running_command:
            return -1
        command = self.command_input.text()
        self.output_area.insertPlainText(command + '\n')
        self.command_input.clear()
        self.command_input.update_history(command)
        self.command_input.setReadOnly(True)

        self.tree_controller.run_command(command)
        return 0


if __name__ == "__main__":
    import sys
    from PyQt5.QtWidgets import QApplication
    from tree import TreeGraphWidget
    app = QApplication(sys.argv)
    tree_graph_widget = TreeGraphWidget()
    command_widget = CommandWidget(tree_graph_widget)
    command_widget.show()
    sys.exit(app.exec_())