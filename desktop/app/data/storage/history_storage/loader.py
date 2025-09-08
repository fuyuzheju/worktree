from pathlib import Path
from ...core.tree import Tree
from .confirmed_history import ConfirmedHistory
from .pending_queue import PendingQueue
from ...core import Operation, ExtOperation, OperationType, PseudoOperationType
import json

class HistoryLoader:
    """
    load a tree from confirmed history and pending queue
    read only to both the containers
    """
    def __init__(self,
                 confirmed_history: ConfirmedHistory,
                 pending_queue: PendingQueue):
        self.confirmed_history = confirmed_history
        self.pending_queue = pending_queue
        # self.snapshots_dir = snapshots_dir
        # if not self.snapshots_dir.exists():
        #     self.snapshots_dir.mkdir(parents=True)

    def load_confirmed_history(self, pop_num: int = 0) -> Tree:
        tree = Tree()
        nodes = self.confirmed_history.get_branch("main", pop_num=pop_num)
        for node in nodes:
            op = Operation.from_dict(json.loads(node.operation))
            res = op.apply(tree)
            assert res == 0, f"Confirmed history damaged, operation: {op}"
        return tree
    
    def pending_queue_loader(self):
        """
        a generator loading pending queue
        everytime loader meets a conflict, it yields out the conflict node
        finally it will return the final result of tree
        """

        # starting from confirmed history

        queue_metadata = self.pending_queue.get_metadata()
        head_id = queue_metadata.head_id
        tail_id = queue_metadata.tail_id

        pop_num = 0 # records how many "undo"s are at the head
        # there can only be undo pseudo-operation at the head of pending queue
        while head_id < tail_id:
            # check if this operation is undo
            node = self.pending_queue.get_by_id(head_id)
            op = ExtOperation.from_dict(json.loads(node.operation))
            if op.op_type.value == PseudoOperationType.UNDO:
                op_serial = op.payload["op_serial"]
                if op_serial == self.confirmed_history.get_head_node().serial_num:
                    # you can only undo the head of confirmed history
                    # if this condition is not satisfied, it means another remote update had
                    # been received after this undo pseudo-operation, which leads to a conflict
                    pop_num += 1
                else:
                    # marks conflict
                    yield node
                
                head_id += 1
            else:
                break
        
        # load confirmed history
        tree = self.load_confirmed_history(pop_num)
        
        # do normal Operations
        while head_id < tail_id:
            node = self.pending_queue.get_by_id(head_id)
            op = ExtOperation.from_dict(json.loads(node.operation))
            assert op.op_type.value != PseudoOperationType.UNDO, "Undo pseudo-operation found in pending queue behind head"

            res = op.apply(tree)
            if res != 0:
                # conflict
                yield node

            head_id += 1
        
        # return the final result of tree
        # get it as the value of StopIteration instance
        return tree