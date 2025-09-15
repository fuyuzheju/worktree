from PyQt5.QtCore import QThread, pyqtSlot, QObject, pyqtSignal
from .syncer import UpdateSyncer
from ...history_storage import HistoryStorage
from ....core import ExtOperation, ExtOperationType
import time, qasync, asyncio

from app.setup import AppContext

class SyncerThread(QThread):
    after_start = pyqtSignal()
    def run(self):
        loop = qasync.QEventLoop(self)
        asyncio.set_event_loop(loop)
        self.after_start.emit()

class HistorySync(QObject):
    """
    running on main thread
    """
    def __init__(self, context: AppContext, history_storage: HistoryStorage):
        super().__init__()

        self.context = context
        self.history_storage = history_storage

        self.thread = SyncerThread()
        self.syncer = UpdateSyncer(context=self.context,
                                   confirmed_history=history_storage.confirmed_history,
                                   pending_queue=history_storage.pending_queue)
        self.syncer.moveToThread(self.thread)
        self.thread.after_start.connect(self.syncer.start)

        self.thread.start()

        self.syncer.request_tree_load.connect(self.load_tree)
    
    def stop(self):
        self.syncer.close.emit()
        self.thread.wait()
    
    @pyqtSlot()
    def load_tree(self):
        self.history_storage.load_tree()
        self.context.work_tree.tree_edit_signal.emit(ExtOperation.from_dict({
            "op_type": ExtOperationType.FLUSH.value,
            "payload": {},
            "timestamp": int(time.time()),
        }))
        self.syncer.wait_flag.set()
