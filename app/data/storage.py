from pathlib import Path
from . import WorkTree
from .tree import Node
import json, time, logging

logger = logging.getLogger(__name__)

class Storage:
    """
    Observes a WorkTree, and stores the history to a file.
    snapshots tree every {snapshot_interval} events.
    """
    def __init__(self, work_tree: WorkTree, storage_dir: Path, snapshot_interval: int = 10):
        self.work_tree = work_tree
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(exist_ok=True)
        self.history_dir = Path(storage_dir) / "history"
        self.history_dir.mkdir(exist_ok=True)

        self.current_snapshot_dir, self.op_count_since_snapshot = self.get_latest_snapshot()
        if self.current_snapshot_dir is None:
            # create the first snapshot
            self.take_snapshot()
        self.snapshot_interval = snapshot_interval

        self.work_tree.edit_signal.connect(self.handle_edit)
        self.work_tree.undo_request.connect(self.undo)

        self.load_from_disk()
    
    def handle_edit(self, operation: dict):
        """
        handle edition and write to disk.
        take snapshot every {snapshot_interval} operations.
        history file direction structure:
        - history
            - snapshot_{timestamp1}
                - op.log // operations between this snapshot and the next, 
                            which is {snapshop_interval} operations in total.
                - snapshot.json // the snapshot at the timestamp
            - snapshot_{timestamp2}
                - op.log
                - snapshot.json
            - ...
        """
        if self.current_snapshot_dir is None:
            self.take_snapshot()
        
        if operation['type'] == '':
            # empty operation type is not recorded
            # details in the clarifications of WorkTree.edit_signal
            return
        
        with open(self.current_snapshot_dir / 'op.log', 'a') as f:
            f.write(json.dumps(operation) + '\n')

        self.op_count_since_snapshot += 1
        if self.op_count_since_snapshot >= self.snapshot_interval:
            self.take_snapshot()
            self.op_count_since_snapshot = 0
    
    def take_snapshot(self):
        logger.debug("Taking snapshot.")
        root_dict = self.work_tree.tree.root.to_dict()
        timestamp = int(time.time())
        snapshot_dir = self.history_dir / f"snapshot_{timestamp}"
        snapshot_dir.mkdir()
        with open(snapshot_dir / 'snapshot.json', 'w') as f:
            json.dump(root_dict, f)

        (snapshot_dir / 'op.log').touch()

        self.current_snapshot_dir = snapshot_dir
        self.op_count_since_snapshot = 0
        logger.info(f"[Storage] Snapshot taken: {snapshot_dir}")

    def get_latest_snapshot(self) -> tuple[Path | None, int]:
        snapshots = list(self.history_dir.glob("snapshot_*"))
        if not snapshots:
            return None, 0
        latest_snapshot = max(snapshots, key=lambda x: int(x.stem.split("_")[-1]))
        op_count = None
        with open(latest_snapshot / 'op.log', 'r') as f:
            op_count = len(f.readlines())
        return latest_snapshot, op_count
    
    def load_snapshot(self, snapshot: dict, operations: list) -> None:
        """
        load a snapshot to a tree.
        """
        new_root = Node.from_dict(snapshot)
        new_tree = WorkTree()
        new_tree.tree.root = new_root
        new_tree.tree.current_node = new_tree.tree.get_current_node(new_root)
        for operation in operations:
            op_type = operation['type']
            args = operation['args']
            op_function = getattr(new_tree.tree, op_type)
            op_function(**args)

        self.work_tree.tree.root = new_tree.tree.root
        self.work_tree.tree.current_node = new_tree.tree.current_node
        self.op_count_since_snapshot = len(operations)

    def load_from_disk(self) -> None:
        """
        load the latest snapshot from disk.
        """
        logger.debug("Loading from disk")
        if self.current_snapshot_dir is None:
            logger.debug("[Storage] No snapshot found. Nothing to load.")
            return
        
        with open(self.current_snapshot_dir / 'snapshot.json', 'r') as f:
            snapshot = json.load(f)
        with open(self.current_snapshot_dir / 'op.log', 'r') as f:
            operations = [json.loads(line) for line in f]
        self.load_snapshot(snapshot, operations)
        self.work_tree.edit_signal.emit({
            'type': '',
            'args': {}
        })

    def undo(self):
        """
        undo the latest operation.
        method: replay the history starting from the latest snapshot.
        """

        if self.current_snapshot_dir is None:
            logger.debug("[Storage] No snapshot found. Nothing to undo.")
            return
        
        with open(self.current_snapshot_dir / 'op.log', 'r') as op_file:
            rollbacked_operations = [json.loads(op) for op in op_file.readlines()]
        
        # find an operated snapshot
        while not rollbacked_operations:
            # rollback to last snapshot
            (self.current_snapshot_dir / "op.log").unlink()
            (self.current_snapshot_dir / "snapshot.json").unlink()
            self.current_snapshot_dir.rmdir()
            self.current_snapshot_dir, self.op_count_since_snapshot = self.get_latest_snapshot()
            if self.current_snapshot_dir is None:
                logger.debug("[Storage] No snapshot found. Nothing to undo.")
                return
            
            with open(self.current_snapshot_dir / 'op.log', 'r') as op_file:
                rollbacked_operations = [json.loads(op) for op in op_file.readlines()]

        rollbacked_operations.pop()
        with open(self.current_snapshot_dir / 'op.log', 'w') as op_file:
            op_file.writelines([json.dumps(op) + '\n' for op in rollbacked_operations])

        self.load_from_disk()
            