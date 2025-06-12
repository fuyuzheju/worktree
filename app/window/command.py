from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QTextEdit, QLabel
from PyQt5.QtCore import QObject, pyqtSignal, QTimer
# from PyQt5.QtCore import pyqtSignal
import time, threading

class TreeController(QObject):
    output_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    finish_signal = pyqtSignal()

    def __init__(self, tree_graph_widget):
        super().__init__()
        self.is_running_command = False
        self.tree_graph_widget = tree_graph_widget
    
    def run_command(self, command):
        """
        asynchronously run the command and return the output as a parameter to the callback function.
        """
        args = command.split()
        if len(args) == 0:
            self.finish_signal.emit()
            return 0
        if args[0] == 'cc':
            res = self.tree_graph_widget.complete_current()
            if res == -1:
                self.error_signal.emit("Error: Current node is not ready yet.\n")
            elif res == 0:
                self.output_signal.emit("Current node completed successfully.\n")

        elif args[0] == 'ck':
            self.output_signal.emit("Current node is_ready: " + str(self.tree_graph_widget.work_tree.current_node.is_ready()) + '\n')

        elif args[0] == 'add':
            if len(args) != 2:
                self.error_signal.emit("Error: add command requires one argument.\n")
                self.finish_signal.emit()
                return 1
            
            # search for node
            current_node = self.tree_graph_widget.work_tree.current_node
            for child in current_node.children:
                if child.name == args[1]:
                    self.error_signal.emit("Error: Node already exists.\n")
                    self.finish_signal.emit()
                    return -1

            new_node = self.tree_graph_widget.add_node(current_node, args[1])

            # switch to the new node
            self.tree_graph_widget.switch_to(new_node)

        elif args[0] =='sw':
            if len(args)!= 2:
                self.error_signal.emit("Error: sw command requires one argument.\n")
                self.finish_signal.emit()
                return 1
            
            if args[1] == '..':
                if self.tree_graph_widget.work_tree.current_node.parent is not None:
                    self.tree_graph_widget.switch_to(self.tree_graph_widget.work_tree.current_node.parent)
                    self.finish_signal.emit()
                else:
                    self.error_signal.emit("Error: Already at the root node.\n")
                    self.finish_signal.emit()
                    return -1
                return 0
            
            elif args[1].startswith('./'):
                name = args[1][2:]
                # search for node
                current_node = self.tree_graph_widget.work_tree.current_node
                for child in current_node.children:
                    if child.name == name:
                        res = self.tree_graph_widget.switch_to(child)
                        if res == -1:
                            self.error_signal.emit("Erorr: Node completed already.\n")
                        self.finish_signal.emit()
                        return 0
                self.error_signal.emit("Error: Node not found.\n")
                self.finish_signal.emit()
                return -1
            
            else:
                current_node = self.tree_graph_widget.work_tree.current_node
                if current_node.parent is None:
                    self.error_signal.emit("Error: Already at the root node.\n")
                    self.finish_signal.emit()
                    return -1
                for child in current_node.parent.children:
                    if child.name == args[1]:
                        res = self.tree_graph_widget.switch_to(child)
                        if res == -1:
                            self.error_signal.emit("Erorr: Node completed already.\n")
                        self.finish_signal.emit()
                        return 0
                self.error_signal.emit("Error: Node not found.\n")
                self.finish_signal.emit()
                return -1

        else:
            self.error_signal.emit("Error: Unknown command.\n")
            self.finish_signal.emit()
            return 127
        
        self.finish_signal.emit()
    
        return 0

class CommandWidget(QWidget):
    def __init__(self, tree_graph_widget, parent=None):
        super().__init__(parent)
        self.tree_graph_widget = tree_graph_widget
        self.initUI()
        self.tree_controller = TreeController(tree_graph_widget)
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

        self.command_label = QLabel(f"({self.tree_graph_widget.work_tree.current_node.name}):")
        self.Hlayout.addWidget(self.command_label)
        self.command_input = QLineEdit()
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
        self.command_label.setText(f"({self.tree_graph_widget.work_tree.current_node.name}):")
        self.output_area.insertPlainText("> ")    

    def input_command(self):
        if self.tree_controller.is_running_command:
            return -1
        command = self.command_input.text()
        self.output_area.insertPlainText(command + '\n')
        self.command_input.clear()
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