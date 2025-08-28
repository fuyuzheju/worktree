from PyQt5.QtWidgets import QGraphicsView, QGraphicsScene, QGraphicsObject, \
    QWidget, QVBoxLayout, QMenu, QAction
from PyQt5.QtCore import Qt, QRectF, QPointF, pyqtSignal
from PyQt5.QtGui import QColor, QPen, QBrush, QFont, QPainter, QFont, QFontMetrics
from ...data.tree import Status, Node
from ...settings import settings_manager
from app.reminders_window import SetReminderDialog

class GraphicsNodeItem(QGraphicsObject):
    """
    the graphics node item
    draw a node and the linking lines in the same column
    dynamically generated and destroyed when the tree is changed
    """
    request_relayout = pyqtSignal()
    change_expanded = pyqtSignal(QGraphicsObject)

    request_add_reminder = pyqtSignal(QGraphicsObject)

    def __init__(self, data_node: Node, prefix: list, 
                 is_expanded: bool, reminder_inf: tuple[int, int] = (0,0)):
        super().__init__()
        self.data_node = data_node
        self.prefix = prefix
        self.is_expanded = is_expanded
        self.depth = len(prefix)
        self.active_reminder_count, self.inactive_reminder_count = reminder_inf
        self.reminder_count = self.active_reminder_count + self.inactive_reminder_count

        self.setFlag(QGraphicsObject.ItemIsSelectable, True)
        self.colors = {Status.COMPLETED: settings_manager.get("graph/completedColor", type=QColor),
                        Status.WAITING: settings_manager.get("graph/waitingColor", type=QColor)}
        self.rect_pen = QPen(settings_manager.get("graph/rectColor", type=QColor), settings_manager.get("graph/rectPenWidth", type=float))
        self.line_pen = QPen(settings_manager.get("graph/lineColor", type=QColor), settings_manager.get("graph/linePenWidth", type=float))
        self.text_pen = QPen(settings_manager.get("graph/textColor", type=QColor), settings_manager.get("graph/textPenWidth", type=float))
        self.fixed_nodewidth, self.fixed_nodeheight = calculate_node_boundary(self.data_node.name)

        self.reminder_dot_size = settings_manager.get("graph/reminderDotSize", type=float)
        self.reminder_dot_spacing = settings_manager.get("graph/reminderDotSpacing", type=float)
        self.reminder_dot_offset = settings_manager.get("graph/reminderDotOffset", type=float)
        self.active_reminder_dot_color = settings_manager.get("graph/activeReminderDotColor", type=QColor)
        self.inactive_reminder_dot_color = settings_manager.get("graph/inactiveReminderDotColor", type=QColor)
        self.active_reminder_dot_pen = QPen(self.active_reminder_dot_color, 1)
        self.active_reminder_dot_brush = QBrush(self.active_reminder_dot_color)
        self.inactive_reminder_dot_pen = QPen(self.inactive_reminder_dot_color, 1)
        self.inactive_reminder_dot_brush = QBrush(self.inactive_reminder_dot_color)

    def boundingRect(self) -> QRectF:
        # NODE_WIDTH = settings_manager.get("graph/nodeWidth", type=float)
        # NODE_HEIGHT = settings_manager.get("graph/nodeHeight", type=float)
        H_SPACING = settings_manager.get("graph/nodeHSpacing", type=float)
        V_SPACING = settings_manager.get("graph/nodeVSpacing", type=float)
        width_fixed_for_reminder_hint = self.reminder_count * \
            (self.reminder_dot_size + self.reminder_dot_spacing) if self.reminder_count > 0 else 0
        return QRectF(-self.depth * H_SPACING, -V_SPACING,
                      self.depth * H_SPACING + self.fixed_nodewidth + width_fixed_for_reminder_hint, 
                      V_SPACING + self.fixed_nodeheight)

    def paint(self, painter, option, widget=None):
        # NODE_WIDTH = settings_manager.get("graph/nodeWidth", type=float)
        # NODE_HEIGHT = settings_manager.get("graph/nodeHeight", type=float)
        H_SPACING = settings_manager.get("graph/nodeHSpacing", type=float)
        V_SPACING = settings_manager.get("graph/nodeVSpacing", type=float)
        FONT_SIZE = settings_manager.get("graph/fontSize", type=int)
        FONT_FAMALY = settings_manager.get("graph/fontFamily", type=str)
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
                painter.drawLine(QPointF(x, -V_SPACING), QPointF(x, self.fixed_nodeheight))
            elif status == 2:
                painter.drawLine(QPointF(x, -V_SPACING), QPointF(x, self.fixed_nodeheight / 2))

        if self.depth > 0:
            elbow_x = -H_SPACING + H_SPACING / 2
            elbow_y = self.fixed_nodeheight / 2
            painter.drawLine(QPointF(elbow_x, elbow_y), QPointF(0, elbow_y)) 

        # node rect
        painter.save()
        bg_color = self.colors.get(self.data_node.status, QColor(Qt.lightGray))
        painter.setBrush(QBrush(bg_color)); painter.setPen(self.rect_pen)
        node_rect = QRectF(0, 0, self.fixed_nodewidth, self.fixed_nodeheight)
        painter.drawRoundedRect(node_rect, 5, 5)
        painter.setPen(self.text_pen); painter.setFont(self.font)
        text_rect = node_rect.adjusted(2, 0, 0, 0)
        painter.drawText(text_rect, Qt.AlignLeft | Qt.AlignVCenter, self.data_node.name)
        if self.data_node.children:
            indicator = "[-]" if self.is_expanded else "[+]"
            painter.drawText(node_rect.adjusted(0, 0, -5, 0), Qt.AlignRight | Qt.AlignVCenter, indicator)
        painter.restore()

        # reminder hint icon
        if self.active_reminder_count > 0 or self.inactive_reminder_count > 0:
            painter.save()
            start_x = self.fixed_nodewidth - self.reminder_dot_size + self.reminder_dot_offset
            dot_y = - self.reminder_dot_offset
            current_x = start_x

            painter.setPen(self.active_reminder_dot_pen)
            painter.setBrush(self.active_reminder_dot_brush)
            for i in range(self.active_reminder_count):
                dot_rect = QRectF(current_x, dot_y, self.reminder_dot_size, self.reminder_dot_size)
                painter.drawEllipse(dot_rect)
                current_x -= (self.reminder_dot_size + self.reminder_dot_spacing)

            painter.setPen(self.inactive_reminder_dot_pen)
            painter.setBrush(self.inactive_reminder_dot_brush)
            for i in range(self.inactive_reminder_count):
                dot_rect = QRectF(current_x, dot_y, self.reminder_dot_size, self.reminder_dot_size)
                painter.drawEllipse(dot_rect)
                current_x -= (self.reminder_dot_size + self.reminder_dot_spacing)
            
            painter.restore()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            if event.pos().x() >= 0 and event.pos().y() >= 0 and self.data_node.children:
                self.change_expanded.emit(self)

    def contextMenuEvent(self, event):
        menu = QMenu()
        add_reminder_action = QAction("Add Reminder", self)
        add_reminder_action.triggered.connect(lambda: self.request_add_reminder.emit(self))
        menu.addAction(add_reminder_action)
        menu.exec_(event.screenPos())


class TreeGraphWidget(QWidget):
    """
    the tree graph window widget
    controls the graph node items and node expansion logics
    """
    def __init__(self, work_tree, parent=None):
        super().__init__(parent)

        self.setWindowTitle("Tree Graph View")
        self.setGeometry(100, 100, 800, 700)

        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)

        self.work_tree = work_tree
        self.work_tree.tree_edit_signal.connect(self.on_tree_edit)
        self.work_tree.reminder_edit_signal.connect(self.relayout_tree)
        self.work_tree.reminder_service.reminder_due.connect(self.relayout_tree)
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene, self)
        self.view.setAlignment(Qt.AlignLeft | Qt.AlignTop)
        self.view.setDragMode(QGraphicsView.ScrollHandDrag)
        self.layout.addWidget(self.view)

        self.expand_status = {self.work_tree.tree.root.identity: True} # store the expand status of each node item, updated dynamically by signals sent from node items
        self.relayout_tree()

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
        H_SPACING = settings_manager.get("graph/nodeHSpacing", type=float)
        V_SPACING = settings_manager.get("graph/nodeVSpacing", type=float)
        # NODE_HEIGHT = settings_manager.get("graph/nodeHeight", type=float)
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

            fixed_nodewidth, fixed_nodeheight = calculate_node_boundary(node.name)

            x_pos = depth * H_SPACING
            y_pos = y_cursor
            is_expanded = self.expand_status.get(node.identity, None)
            if is_expanded is None:
                is_expanded = True
                self.expand_status[node.identity] = True
            reminders = self.work_tree.reminder_service.get_reminders_by_node_id(node.identity)
            item = GraphicsNodeItem(node, prefix, is_expanded, calculate_reminder_type(reminders))
            item.request_add_reminder.connect(self.on_reminder_add)
            self.init_item(item)
            self.scene.addItem(item)
            item.setPos(x_pos, y_pos)
            y_cursor += fixed_nodeheight + V_SPACING

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
        
        recursively_layout_tree(self.work_tree.tree.root, 0, list(), True)
    
    def change_expanded(self, node_item):
        self.expand_status[node_item.data_node.identity] = not self.expand_status[node_item.data_node.identity]
        self.relayout_tree()
    
    def on_tree_edit(self, edit_data):
        etype = edit_data['type']
        if etype in ['remove_node', 'remove_subtree', 'move_node', '']:
            self.relayout_tree()
        elif etype in ['complete_node', 'complete_current', 'reopen_node']:
            self.scene.update()

        if etype == 'add_node':
            new_node_id = edit_data['args']['new_node_id']
            new_node = self.work_tree.tree.get_node_by_id(new_node_id)
            self.expand_status[new_node.identity] = True
            self.relayout_tree()

        if etype == 'switch_to':
            edit_node_id = edit_data['args']['node_id']
            edit_node = self.work_tree.tree.get_node_by_id(edit_node_id)
            def check_expanded(node):
                if not self.expand_status[node.identity]:
                    self.expand_status[node.identity] = True
                if node.parent:
                    check_expanded(node.parent)

            check_expanded(edit_node)
            self.relayout_tree()

    def on_reminder_add(self, graghnode: GraphicsNodeItem):
        node = graghnode.data_node
        dialog = SetReminderDialog(node, self.work_tree, None)
        dialog.exec_()
        self.relayout_tree()

def calculate_node_boundary(text: str) -> tuple[float,float] :
    """calculate a node's width and height according to its text"""
    # According to text, adjust node_length
    FONT_OBJECT = QFont(settings_manager.get("graph/fontFamily", type=str), settings_manager.get("graph/fontSize", type=int))
    # build QfontMetrics Objext, compute NodeWidth
    METRICS = QFontMetrics(FONT_OBJECT)
    fixed_nodewidth = max(settings_manager.get("graph/minNodeWidth", type=float),
            METRICS.horizontalAdvance(text+' [+]') + 2 * settings_manager.get("graph/rectPenWidth", type=float))
    fixed_nodeheight = max(settings_manager.get("graph/minNodeHeight", type=float),
            METRICS.height() + 2 * settings_manager.get("graph/rectPenWidth", type=float),
        )
    return (fixed_nodewidth, fixed_nodeheight)

def calculate_reminder_type(reminders: list) -> tuple[int, int]:
    active = 0
    for reminder in reminders:
        if reminder.active:
            active += 1
    return (active, len(reminders) - active)