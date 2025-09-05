from .loader import HistoryLoader
from .confirmed_history import ConfirmedHistory
from .pending_queue import PendingQueue
from ...core import ExtOperation, ExtOperationType, OperationType
from app.setup import AppContext
import time

from ...core import Operation
from .pending_queue import PendingOperationNode
from typing import Iterable

class HistoryStorage:
    def __init__(self, context: AppContext, db_url: str):
        self.context = context
        self.confirmed_history = ConfirmedHistory(db_url)
        self.pending_queue = PendingQueue(db_url)
        self.loader = HistoryLoader(self.confirmed_history, self.pending_queue)
        self.context.work_tree.tree_edit_signal.connect(self.handle_tree_edit)

        self.load_tree()
    
    def handle_tree_edit(self, operation: Operation):
        if operation.op_type.value in OperationType:
            self.pending_queue.push(operation)
    
    def load_tree(self):
        loader: Iterable[PendingOperationNode] = self.loader.pending_queue_loader()
        while True:
            try:
                conflict = next(loader)
            except StopIteration as e:
                self.context.work_tree.tree = e.value
                break
            self._process_conflict(conflict)
    
    def _process_conflict(self, conflict: PendingOperationNode):
        print(f"conflict at {conflict.operation} ({conflict.id})")
    
    def undo(self):
        if not self.pending_queue.is_empty():
            self.pending_queue.pop_back()
            self.load_tree()
            self.context.work_tree.tree_edit_signal.emit(ExtOperation.from_dict({
                "op_type": ExtOperationType.UNDO.value,
                "payload": {},
                "timestamp": int(time.time()),
            }))

        else:
            undo_operation = ExtOperation.from_dict({
                "op_type": ExtOperationType.UNDO.value,
                "payload": {self.confirmed_history.get_head_node().serial_num},
                "timestamp": int(time.time()),
            })
            self.pending_queue.push(undo_operation)
            self.load_tree()
            self.context.work_tree.tree_edit_signal.emit(undo_operation)
