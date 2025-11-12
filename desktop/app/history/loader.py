from PyQt5.QtCore import QObject, pyqtSignal, QThread
from PyQt5.QtWidgets import QMessageBox
from app.requester import Requester
from app.history.database import Database
from app.history.core import Operation, parse_operation, Tree, OperationType, Status, Node
from app.globals import context
from typing import cast, Optional
import logging

class TreeLoader(QObject):
    """
    Tree loader loads and stores a tree from all the history(both
    confirmed and pending), and checks conflicts meanwhile.
    When conflicts occur, loader asks the user to overwrite the history
    by pending queue, or scarcely the discard the pending operation that
    leads to conflict.
    In the first case, we calls an HTTP API of server, to overwrite the
    confirmed history, and synchronize it later.
    In the second case, we pop the head of the pending queue.
    """
    reloaded = pyqtSignal()

    def __init__(self,
                 database: Database,
                 requester: Requester):
        super().__init__()
        
        self.database = database
        self.requester = requester
        self.reload()
        self.database.updated.connect(self.reload)

        self.logger = logging.getLogger(__name__)
    
    def reload(self):
        self.tree = Tree()
        operation_stack: list[Operation] = []

        # get all the operations
        assert self.database.pending_queue.metadata is not None
        pending = [parse_operation(node.operation) for node in self.database.pending_queue.get_all()]
        pending.reverse()
        operation_stack += cast(list[Operation], pending)

        curr = self.database.confirmed_history.get_head()
        while curr is not None:
            op = parse_operation(curr.operation)
            assert op is not None
            operation_stack.append(op)
            curr = self.database.confirmed_history.\
                get_by_id(curr.next_id)
        
        while len(operation_stack) > 0:
            op = operation_stack.pop()
            code = op.apply(self.tree)
            if code != 0:
                # conflict
                self.logger.info("Conflict occured.")
                self.process_conflict(op)
                break
        
        # conflicts solved
        self.reloaded.emit()
        semaphore = context.current_app.syncer.network_connector.reconnect_waiting_for_solving_conflicts # type: ignore
        if semaphore is not None:
            semaphore.release()
    
    def check(self, operation: Operation):
        """
        check if an operation is allowed
        """
        if operation.op_type == OperationType.ADD_NODE:
            parent_node_id = operation.payload["parent_node_id"] # type: ignore
            new_node_name = operation.payload["new_node_name"] # type: ignore
            parent_node = self.tree.get_node_by_id(parent_node_id)
            if parent_node is None:
                return False
            if new_node_name in [child.name for child in parent_node.children]:
                return False
        elif operation.op_type == OperationType.REOPEN_NODE:
            node_id = operation.payload["node_id"] # type: ignore
            node = self.tree.get_node_by_id(node_id)
            if node is None or node.status != Status.COMPLETED:
                return False
        elif operation.op_type == OperationType.COMPLETE_NODE:
            node_id = operation.payload["node_id"] # type: ignore
            node = self.tree.get_node_by_id(node_id)
            if node is None or not node.is_ready():
                return False
            if node.status == Status.COMPLETED:
                return False
        elif operation.op_type == OperationType.REMOVE_NODE:
            node_id = operation.payload["node_id"] # type: ignore
            node = self.tree.get_node_by_id(node_id)
            if node is None:
                return False
            if node.children or (node.parent is None):
                return False
        elif operation.op_type == OperationType.REMOVE_SUBTREE:
            node_id = operation.payload["node_id"] # type: ignore
            node = self.tree.get_node_by_id(node_id)
            if node is None:
                return False
            if node.parent is None:
                return False
        elif operation.op_type == OperationType.MOVE_NODE:
            node_id = operation.payload["node_id"] # type: ignore
            new_parent_id = operation.payload["new_parent_id"] # type: ignore
            node = self.tree.get_node_by_id(node_id)
            if node is None or node.parent is None:
                return False

            new_parent = self.tree.get_node_by_id(new_parent_id)
            if new_parent is None:
                return False

            # you can't move a node to its child
            curr: Optional[Node] = new_parent
            while curr is not None and curr.identity != self.tree.root.identity:
                if curr == node:
                    return False
                curr = curr.parent
            
            if any([child.name == node.name for child in new_parent.children]):
                return False
        else:
            return False

        return True

    
    def process_conflict(self, operation: Operation):
        msg_box = QMessageBox()
        msg_box.setWindowTitle("Conflict")
        msg_box.setText(
f"""A conflict occured.
Which solution do you prefer?
1. Discard rest of local operations starting from: {operation.stringify()}
2. Force overwrite the remote history(DANGER!!)
""")

        discard = msg_box.addButton("Discard", QMessageBox.ButtonRole.YesRole)
        overwrite = msg_box.addButton("Overwrite", QMessageBox.ButtonRole.NoRole)
        msg_box.setDefaultButton(discard)

        ans = msg_box.exec()
        if ans == 0:
            # discard
            if not self.database.pending_queue.is_empty():
                self.database.pending_queue.clear()
            self.logger.info("Conflict resolve: discard.")
            return False
        if ans == 1:
            # overwrite
            assert self.database.pending_queue.metadata is not None
            pending = [parse_operation(node.operation) for node in self.database.pending_queue.get_all()]
            self.requester.overwrite(
                starting_serial_num=self.database.pending_queue.metadata.starting_serial_num,
                operations=cast(list[Operation], pending),
            )
            self.logger.info("Conflict resolve: overwrite.")
            return True
