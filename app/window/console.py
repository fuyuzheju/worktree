from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QTextEdit, QLabel
from PyQt5.QtCore import QObject, pyqtSignal, Qt

COMMAND_HISTORY_LENGTH = 300

class TreeController(QObject):
    output_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    finish_signal = pyqtSignal()

    def __init__(self, work_tree: "WorkTree") -> None:
        super().__init__()
        self.is_running_command = False
        self.work_tree = work_tree
    
    def path_parser(self, path: str, current: "Node") -> "Node":
        """
        parse the path and return the node
        :param path: the path to parse
        :param current: the current node, to which the path is relative, while needless for absolute path
        :return: the node; None when failed to find a node
        """
        print(f"PARSING: {path} at current {current.name}")
        if path == "":
            return current

        if not path.endswith('/'):
            path += '/'

        if path.startswith('/'):
            # absolute path
            path = path[1:]
            current = self.work_tree.root
        else:
            # relative path, starts at current node
            pass
            
        parts = path.split('/')
        for p in parts:
            if p == '':
                continue
            if p == '..':
                if current.parent is not None:
                    current = current.parent
                else:
                    return None
            elif p == '.':
                continue
            else:
                # search for node
                for child in current.children:
                    if child.name == p:
                        current = child
                        break
                else:
                    return None
        return current
    
    def run_command(self, command: str) -> int:
        """
        run the command and return the output as a parameter to the callback function.
        :return: 0 for success, -1 for command error, 1 for invalid command
        """
        parts = command.split()
        if len(parts) == 0:
            self.finish_signal.emit()
            return 0

        cmd = parts[0]
        args = []
        options = []
        for p in parts[1:]:
            if p[0] == '-':
                options.append(p[1:])
            else:
                args.append(p)

        if cmd == 'cc':
            res = self.work_tree.complete_current()
            if res == -1:
                self.error_signal.emit("Error: Current node is not ready yet.\n")
            elif res == 0:
                self.output_signal.emit("Current node completed successfully.\n")

        elif cmd == 'ck':
            self.output_signal.emit("Current node is_ready: " + str(self.work_tree.current_node.is_ready()) + '\n')

        elif cmd == 'add':
            if len(args) != 1:
                self.error_signal.emit("Error: add command requires one argument.\n")
                self.finish_signal.emit()
                return 1

            name = args[0]
            if '.' in name or '/' in name or ':' in name or name == '':
                self.error_signal.emit("Error: Invalid node name.\n")
                self.finish_signal.emit()
                return 1
            # search for node
            current_node = self.work_tree.current_node
            for child in current_node.children:
                if child.name == name:
                    self.error_signal.emit("Error: Node already exists.\n")
                    self.finish_signal.emit()
                    return -1

            new_node = self.work_tree.add_node(current_node, name)

            # switch to the new node
            self.work_tree.switch_to(new_node)

        elif cmd =='cd':
            if len(args) != 1:
                self.error_signal.emit("Error: sw command requires one argument.\n")
                self.finish_signal.emit()
                return 1

            path = args[0]
            target = self.path_parser(path, self.work_tree.current_node)
            if target is None:
                self.error_signal.emit("Error: No such node.\n")
                self.finish_signal.emit()
                return -1
            res = self.work_tree.switch_to(target)
            if res == -1:
                self.error_signal.emit("Error: Node completed already.\n")
                self.finish_signal.emit()
                return -1
        
        elif cmd == 'rm':
            if len(args) != 1:
                self.error_signal.emit("Error: rm command requires one argument.\n")
                self.finish_signal.emit()
                return 1
            
            path = args[0]
            target = self.path_parser(path, self.work_tree.current_node)
            if target is None:
                self.error_signal.emit("Error: No such node.\n")
                self.finish_signal.emit()
                return -1

            if 'r' in options:
                st = self.work_tree.remove_subtree(target)
            else:
                st = self.work_tree.remove_node(target)
            if st != 0:
                self.error_signal.emit("Error: Failed to remove node.\n")
                self.finish_signal.emit()
                return -1

        else:
            self.error_signal.emit("Error: Unknown command.\n")
            self.finish_signal.emit()
            return 1
        
        self.finish_signal.emit()
    
        return 0


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