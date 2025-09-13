from PyQt5.QtCore import QThread, pyqtSlot, QObject
from .syncer import UpdateSyncer
from ...history_storage import HistoryStorage
from ....core import ExtOperation, ExtOperationType
import time

from app.setup import AppContext

class HistorySync(QObject):
    """
    running on main thread
    """
    def __init__(self, context: AppContext, history_storage: HistoryStorage):
        super().__init__()

        self.context = context
        self.history_storage = history_storage

        self.thread = QThread()
        self.syncer = UpdateSyncer(context=self.context,
                                   confirmed_history=history_storage.confirmed_history,
                                   pending_queue=history_storage.pending_queue)
        
        self.syncer.moveToThread(self.thread)
        self.thread.started.connect(self.syncer.start)

        self.syncer.request_tree_load.connect(self.load_tree)
    
        self.thread.start()
    
    @pyqtSlot()
    def load_tree(self):
        self.history_storage.load_tree()
        self.context.work_tree.tree_edit_signal.emit(ExtOperation.from_dict({
            "op_type": ExtOperationType.FLUSH.value,
            "payload": {},
            "timestamp": int(time.time()),
        }))
        self.syncer.wait_flag.set()
