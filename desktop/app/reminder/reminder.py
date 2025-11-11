from datetime import datetime
from typing import Optional
import uuid

class Reminder:
    def __init__(self, 
            node_id: str, 
            due_time: datetime, 
            message: str,
            reminder_id: Optional[str] = None,
            active: bool = True):
        self.node_id = node_id
        self.due_time = due_time
        self.message = message
        self.reminder_id = reminder_id or str(uuid.uuid4().hex)
        self.active = active
    
    def set(self, due_time: Optional[datetime] = None, message: Optional[str] = None, active: Optional[bool] = None):
        if due_time is not None:
            self.due_time = due_time
        if message is not None:
            self.message = message
        if active is not None:
            self.active = active
    
    def to_dict(self):
        return {
            "node_id": self.node_id,
            "due_time": self.due_time.isoformat(),
            "message": self.message,
            "reminder_id": self.reminder_id,
            "active": self.active,
        }
    
    @classmethod
    def from_dict(cls, data: dict):
        return cls(
            node_id=data["node_id"],
            due_time=datetime.fromisoformat(data["due_time"]),
            message=data["message"],
            reminder_id=data["reminder_id"],
            active=data["active"],
        )
    
    def __repr__(self):
        return f"Reminder(node_id={self.node_id}, due_time={self.due_time}, message={self.message}, reminder_id={self.reminder_id}, active={self.active})"
    
    def __str__(self):
        return self.__repr__()

    def __eq__(self, other):
        if not isinstance(other, Reminder):
            return False
        return self.node_id == other.node_id and self.due_time == other.due_time

