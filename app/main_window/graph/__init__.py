from PyQt5.QtWidgets import QGraphicsView, QGraphicsScene, QGraphicsObject, \
    QWidget, QVBoxLayout
from PyQt5.QtCore import Qt, QRectF, QPointF, pyqtSignal
from PyQt5.QtGui import QColor, QPen, QBrush, QFont, QPainter
from ...data.tree import Status, Node
from ...settings import settings_manager
from app import settings

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
        self.colors = {Status.COMPLETED: settings_manager.get("graph/completedColor"),
                        Status.CURRENT: settings_manager.get("graph/currentColor"),
                        Status.WAITING: settings_manager.get("graph/waitingColor")}
        self.rect_pen = QPen(settings_manager.get("graph/rectColor"), settings_manager.get("graph/rectPenWidth"))
        self.line_pen = QPen(settings_manager.get("graph/lineColor"), settings_manager.get("graph/linePenWidth"))
        self.text_pen = QPen(settings_manager.get("graph/textColor"), settings_manager.get("graph/textPenWidth"))

    def boundingRect(self) -> QRectF:
        NODE_WIDTH = settings_manager.get("graph/nodeWidth")
        NODE_HEIGHT = settings_manager.get("graph/nodeHeight")
        H_SPACING = settings_manager.get("graph/nodeHSpacing")
        V_SPACING = settings_manager.get("graph/nodeVSpacing")
        return QRectF(-self.depth * H_SPACING, -V_SPACING,
                      self.depth * H_SPACING + NODE_WIDTH, V_SPACING + NODE_HEIGHT)

    def paint(self, painter, option, widget=None):
        NODE_WIDTH = settings_manager.get("graph/nodeWidth")
        NODE_HEIGHT = settings_manager.get("graph/nodeHeight")
        H_SPACING = settings_manager.get("graph/nodeHSpacing")
        V_SPACING = settings_manager.get("graph/nodeVSpacing")
        FONT_SIZE = settings_manager.get("graph/fontSize")
        FONT_FAMALY = settings_manager.get("graph/fontFamily")
        self.font = QFont(FONT_FAMALY, FONT_SIZE)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setPen(self.line_pen)
        # linking lines
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


class TreeGraphWidget(QWidget):
    def __init__(self, work_tree, parent=None):
        super().__init__(parent)

        self.setWindowTitle("Tree Graph View")
        self.setGeometry(100, 100, 800, 700)

        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)

        self.work_tree = work_tree
        self.work_tree.edit_signal.connect(self.on_tree_edit)
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene, self)
        self.view.setAlignment(Qt.AlignLeft | Qt.AlignTop)
        self.view.setDragMode(QGraphicsView.ScrollHandDrag)
        self.layout.addWidget(self.view)

        self.expand_status = {self.work_tree.root.identity: True} # store the expand status of each node item, updated dynamically by signals sent from node items
        self.relayout_tree()
        # self.create_sample_data()

        settings_manager.settings_changed.connect(self.update_settings)
    
    def update_settings(self, keys):
        flag = False
        for key in keys:
            if key.startswith("graph/"):
                flag = True
                break
        if flag:
            self.relayout_tree()

    def init_item(self, item):
        item.change_expanded.connect(self.change_expanded)
        item.request_relayout.connect(self.relayout_tree)

    def relayout_tree(self):
        H_SPACING = settings_manager.get("graph/nodeHSpacing")
        V_SPACING = settings_manager.get("graph/nodeVSpacing")
        NODE_HEIGHT = settings_manager.get("graph/nodeHeight")
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

            x_pos = depth * H_SPACING
            y_pos = y_cursor
            is_expanded = self.expand_status.get(node.identity, None)
            if is_expanded is None:
                is_expanded = True
                self.expand_status[node.identity] = True
            item = GraphicsNodeItem(node, prefix, is_expanded)
            self.init_item(item)
            self.scene.addItem(item)
            item.setPos(x_pos, y_pos)
            y_cursor += NODE_HEIGHT + V_SPACING

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
        self.expand_status[node_item.data_node.identity] = not self.expand_status[node_item.data_node.identity]
        self.relayout_tree()
    
    def on_tree_edit(self, edit_data):
        """
        edit_data: a dict of the edit data, which should contain the following keys:
        - 'type': the type of the edit, which can be 'add', 'remove', 'rename', 'move'
        - 'args': a list of arguments, which depends on the type of the edit
        """
        etype = edit_data['type']
        if etype in ['remove_node', 'remove_subtree', 'undo']:
            self.relayout_tree()
        elif etype in ['complete_node', 'complete_current']:
            self.scene.update()

        if etype == 'add_node':
            new_node_id = edit_data['args']['new_node_id']
            new_node = self.work_tree.get_node_by_id(new_node_id)
            self.expand_status[new_node.identity] = True
            self.relayout_tree()

        if etype == 'switch_to':
            edit_node_id = edit_data['args']['node_id']
            edit_node = self.work_tree.get_node_by_id(edit_node_id)
            def check_expanded(node):
                if not self.expand_status[node.identity]:
                    self.expand_status[node.identity] = True
                if node.parent:
                    check_expanded(node.parent)

            check_expanded(edit_node)
            self.relayout_tree()
    
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
