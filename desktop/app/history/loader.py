from PyQt5.QtCore import QObject, pyqtSignal
from PyQt5.QtWidgets import QMessageBox
from app.requester import Requester
from app.history.database import Database
from app.history.core import Operation, parse_operation, Tree
from typing import cast

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
    
    def reload(self):
        self.tree = Tree()
        operation_stack: list[Operation] = []

        # get all the operations
        assert self.database.pending_queue.metadata is not None
        pending_queue_pointed = self.database.pending_queue.metadata.starting_serial_num
        pending = [parse_operation(node.operation) for node in self.database.pending_queue.get_all()]
        assert all(pending)
        operation_stack += cast(list[Operation], pending)

        curr = self.database.confirmed_history.\
            get_by_serial_num(pending_queue_pointed)
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
                code = self.process_conflict(op)
                if code:
                    # overwrited
                    break
                
                # if discarded, continue to the next operation
        
        self.reloaded.emit()
    
    def process_conflict(self, operation: Operation):
        msg_box = QMessageBox()
        msg_box.setWindowTitle("Conflict")
        msg_box.setText(
f"""A conflict occured.
Which solution do you prefer?
1. Discard local operation {operation.stringify()}
2. Force overwrite the remote history(DANGER!!)
""")

        discard = msg_box.addButton("Discard", QMessageBox.ButtonRole.YesRole)
        overwrite = msg_box.addButton("Overwrite", QMessageBox.ButtonRole.NoRole)
        msg_box.setDefaultButton(discard)

        ans = msg_box.exec()
        if ans == 0:
            # discard
            self.database.pending_queue.pop()
            return False
        if ans == 1:
            # overwrite
            assert self.database.pending_queue.metadata is not None
            pending = [parse_operation(node.operation) for node in self.database.pending_queue.get_all()]
            self.requester.overwrite(
                starting_serial_num=self.database.pending_queue.metadata.starting_serial_num,
                operations=cast(list[Operation], pending),
            )
            return True
