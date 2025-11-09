from sqlalchemy.orm import Session
from app.history.core import Operation

class ConfirmedHistory:
    """
    Confirmed history stores the operations confirmed by server.
    Every confirmed operation has a serial num, which marks its order
    in the history(serial num starts from 1)
    Confirmed history must be integral and non-conflicting.
    Many parts are designed to try to synchronize the confirmed history
    with server in time.
    """
    def __init__(self, session: Session):
        self.session = session
    
    def getById(self, node_id: int):
        pass

    def getHead(self):
        pass

    def insertAtHead(self, operation: Operation):
        pass
    
    def overwrite(self, starting_serial_num: int, operations: list[Operation]):
        pass