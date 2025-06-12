import uuid
from enum import Enum
from PyQt5.QtWidgets import QApplication, QGraphicsView, QGraphicsScene, QGraphicsObject, \
    QWidget, QVBoxLayout
from PyQt5.QtCore import Qt, QRectF, QPointF, pyqtSignal
from PyQt5.QtGui import QColor, QPen, QBrush, QPainterPath, QFont, QPainter

NODE_WIDTH = 80
NODE_HEIGHT = 18
H_SPACING = 25
V_SPACING = 15 # spacing between two nodes, not including the height of node
FONT_SIZE = 10

class Status(Enum):
    """
    Status Clarification:
    Waiting: a workstep whose dependencies not completed, but not in current work
    Current: a workstep in current work (usually only one)
    Completed: a workstep completed
    """
    WAITING = "Waiting"
    CURRENT = "Current"
    COMPLETED = "Completed"


class Node:
    def __init__(self, name, parent=None):
        self.identity = uuid.uuid4().hex
        self.name = name
        self.parent = parent
        self.children = []
        self.status = Status.WAITING # default status

    def addChild(self, child_node):
        self.children.append(child_node)

    def is_ready(self):
        """检查所有前置步骤（子节点）是否都已完成"""
        for child in self.children:
            if child.status != Status.COMPLETED:
                return False
        return True

    def row(self):
        """返回该节点在其父节点的子节点列表中的索引"""
        if self.parent:
            return self.parent.children.index(self)
        return 0


class WorkTree:
    """管理整个工作树的逻辑"""
    def __init__(self):
        self.root = Node("WorkRoot")
        self.root.status = Status.CURRENT
        self.current_node = self.root

    def get_node_by_id(self, identity, start_node=None):
        if start_node is None:
            start_node = self.root

        if start_node.identity == identity:
            return start_node
        
        for child in start_node.children:
            found = self.get_node_by_id(identity, child)
            if found:
                return found
        return None

    def add_node(self, parent_node, new_node_name):
        new_node = Node(new_node_name, parent=parent_node)
        parent_node.addChild(new_node)
        self.current_node.status = Status.WAITING
        self.current_node = new_node
        new_node.status = Status.CURRENT

        return new_node

    def complete_step(self, node):
        if not node.is_ready():
            return -1
        node.status = Status.COMPLETED
        return 0

    def complete_current(self):
        if not self.current_node.is_ready():
            return -1
        self.current_node.status = Status.COMPLETED

        if self.current_node.parent is None:
            return 0
        for child in self.current_node.parent.children:
            if child.status == Status.WAITING:
                self.current_node = child
                self.current_node.status = Status.CURRENT
                return 0
        else:
            self.current_node = self.current_node.parent
            self.current_node.status = Status.CURRENT
            return 0
    
    def switch_to(self, node):
        if node.status == Status.COMPLETED:
            return -1
        self.current_node.status = Status.WAITING
        self.current_node = node
        self.current_node.status = Status.CURRENT
        return 0
    
    def remove_node(self, node):
        if node.children or node == self.root:
            return -1
        node.parent.children.remove(node)
        return 0
    
    def remove_subtree(self, node):
        if node == self.root:
            return -1
        node.parent.children.remove(node)
        for child in node.children:
            self.remove_subtree(child)
        return 0


class GraphicsNodeItem(QGraphicsObject):
    request_relayout = pyqtSignal()
    change_expanded = pyqtSignal(QGraphicsObject)

    def __init__(self, data_node: Node, prefix: list, is_expanded: bool):
        super().__init__()
        self.data_node = data_node
        self.prefix = prefix
        self.is_expanded = is_expanded
        self.depth = len(prefix)

        self.setFlag(QGraphicsObject.ItemIsSelectable, True)
        self.colors = {Status.COMPLETED: QColor("#c8e6c9"),
                        Status.CURRENT: QColor("#bbdefb"),
                        Status.WAITING: QColor("#fff9c4")}
        self.rect_pen = QPen(Qt.black, 1.5)
        self.line_pen = QPen(Qt.gray, 2)
        self.text_pen = QPen(Qt.black)
        self.font = QFont("Arial", FONT_SIZE)

    def boundingRect(self) -> QRectF:
        return QRectF(-self.depth * H_SPACING, -V_SPACING,
                      self.depth * H_SPACING + NODE_WIDTH, V_SPACING + NODE_HEIGHT)

    def paint(self, painter, option, widget=None):
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setPen(self.line_pen)
        # linking lines
        # depth = len(self.prefix)
        for i in range(self.depth):
            status = self.prefix[i]
            x = -(self.depth - i) * H_SPACING + H_SPACING / 2

            if status == 0:
                continue
            elif status == 1:
                painter.drawLine(QPointF(x, -V_SPACING), QPointF(x, NODE_HEIGHT))
            elif status == 2:
                painter.drawLine(QPointF(x, -V_SPACING), QPointF(x, NODE_HEIGHT / 2))

        if self.depth > 0:
            elbow_x = -H_SPACING + H_SPACING / 2
            elbow_y = NODE_HEIGHT / 2
            painter.drawLine(QPointF(elbow_x, elbow_y), QPointF(0, elbow_y)) 

        # node rect
        painter.save()
        bg_color = self.colors.get(self.data_node.status, QColor(Qt.lightGray))
        painter.setBrush(QBrush(bg_color)); painter.setPen(self.rect_pen)
        node_rect = QRectF(0, 0, NODE_WIDTH, NODE_HEIGHT)
        painter.drawRoundedRect(node_rect, 5, 5)
        painter.setPen(self.text_pen); painter.setFont(self.font)
        text_rect = node_rect.adjusted(10, 5, -10, -5)
        painter.drawText(text_rect, Qt.AlignLeft | Qt.AlignVCenter, self.data_node.name)
        if self.data_node.children:
            indicator = "[-]" if self.is_expanded else "[+]"
            painter.drawText(node_rect.adjusted(0, 0, -5, 0), Qt.AlignRight | Qt.AlignVCenter, indicator)
        painter.restore()

    def mousePressEvent(self, event):
        if event.pos().x() >= 0 and event.pos().y() >= 0 and self.data_node.children:
            self.change_expanded.emit(self)
        # super().mousePressEvent(event)


class TreeGraphWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__()

        self.setWindowTitle("Tree Graph View")
        self.setGeometry(100, 100, 800, 700)

        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)

        self.work_tree = WorkTree()
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene, self)
        self.view.setAlignment(Qt.AlignLeft | Qt.AlignTop)
        self.view.setDragMode(QGraphicsView.ScrollHandDrag)
        self.layout.addWidget(self.view)

        self.expand_status = {self.work_tree.root: True} # store the expand status of each node item, updated dynamically by signals sent from node items
        self.relayout_tree()
        # self.create_sample_data()

    def init_item(self, item):
        item.change_expanded.connect(self.change_expanded)
        item.request_relayout.connect(self.relayout_tree)

    def relayout_tree(self):
        # print("RELAYOUT")

        self.scene.clear()

        y_cursor = 0 # shared across all recursive calls
        def recursively_layout_tree(node, depth, prefix, is_last_child):
            """
            symbols of prefix:
            - 0: empty
            - 1: vertical line
            - 2: half vertical line
            """
            nonlocal y_cursor
            # 计算位置并放置
            x_pos = depth * H_SPACING
            y_pos = y_cursor
            is_expanded = self.expand_status.get(node)
            item = GraphicsNodeItem(node, prefix, is_expanded)
            self.init_item(item)
            self.scene.addItem(item)
            item.setPos(x_pos, y_pos)
            y_cursor += NODE_HEIGHT + V_SPACING
            # 递归
            if is_expanded and node.children:
                # recusively layout the children
                for child in node.children:
                    last_child = (child == node.children[-1])
                    new_prefix = prefix.copy()
                    if is_last_child and new_prefix:
                        new_prefix[-1] = 0
                    if last_child:
                        new_prefix.append(2)
                    else:
                        new_prefix.append(1)
                    recursively_layout_tree(child, depth + 1, new_prefix, last_child)
        
        recursively_layout_tree(self.work_tree.root, 0, list(), True)
    
    def change_expanded(self, node_item):
        self.expand_status[node_item.data_node] = not self.expand_status[node_item.data_node]
        self.relayout_tree()
    
    def add_node(self, parent_node, new_node_name):
        new_node = self.work_tree.add_node(parent_node, new_node_name)
        self.expand_status[new_node] = True
        self.relayout_tree()

        return new_node

    def complete_step(self, node_item):
        res = self.work_tree.complete_step(node_item.data_node)
        self.scene.update()
        return res

    def complete_current(self):
        res = self.work_tree.complete_current()
        self.scene.update()
        return res

    def switch_to(self, node):
        res = self.work_tree.switch_to(node)
        flag = False
        def check_expanded(node):
            nonlocal flag
            if not self.expand_status[node]:
                self.expand_status[node] = True
                flag = True
            if node.parent:
                check_expanded(node.parent)

        check_expanded(node)
        if flag:
            self.relayout_tree()
        else:
            self.scene.update()
        return res
    
    def remove_node(self, node):
        st = self.work_tree.remove_node(node)
        if st != 0:
            return st

        self.relayout_tree()
        return 0
    
    def remove_subtree(self, node_item):
        st = self.work_tree.remove_subtree(node_item.data_node)
        if st != 0:
            return st

        self.relayout_tree()
        return 0

    def create_sample_data(self):
        root = self.work_tree.root
        Node1 = self.add_node(root, "Node1")
        Node2 = self.add_node(root, "Node2")
        Node3 = self.add_node(root, "Node3")
        Node4 = self.add_node(Node1, "Node4")
        Node5 = self.add_node(Node1, "Node5")
        for i in range(10):
            self.add_node(Node5, "Node5."+str(i))
        
        self.complete_current()
        self.complete_current()
        
        # self.complete_current()
        # self.complete_current()

# if __name__ == '__main__':
#     import sys, traceback
#     def global_exception_hook(exctype, value, tb):
#         print("Traceback:")
#         traceback.print_tb(tb)
#         print("An unhandled exception occurred:", exctype, value)
#         QApplication.quit()
#     app = QApplication(sys.argv)
#     sys.excepthook = global_exception_hook
#     window = TreeGraphWidget()
#     window.show()
#     sys.exit(app.exec_())