from sqlalchemy import Integer, String, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship,\
                           mapped_column, Mapped

CONFIRMED_OPERATION_TABLE = "confirmed_operation"
HISTORY_METADATA_TABLE = "history_metadata"
PENDING_OPERATION_TABLE = "pending_operations"
QUEUE_METADATA_TABLE = "queue_metadata"

class Base(DeclarativeBase):
    pass


class ConfirmedOperationNode(Base):
    __tablename__ = CONFIRMED_OPERATION_TABLE

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    serial_num: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(512), nullable=False)
    history_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    next_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{CONFIRMED_OPERATION_TABLE}.id"), nullable=False)
    next_node = relationship("ConfirmedOperationNode", remote_side=[id], uselist=False)


class ConfirmedHistoryMetadata(Base):
    __tablename__ = HISTORY_METADATA_TABLE

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    head_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{CONFIRMED_OPERATION_TABLE}.id"), nullable=False)
    head_node = relationship("ConfirmedOperationNode")


class PendingOperationNode(Base):
    __tablename__ = PENDING_OPERATION_TABLE

    id: Mapped[int] = mapped_column(Integer, primary_key=True, nullable=False)
    operation: Mapped[str] = mapped_column(String(512), nullable=False)


class PendingQueueMetadata(Base):
    __tablename__ = QUEUE_METADATA_TABLE
    id: Mapped[int] = mapped_column(Integer, primary_key=True, nullable=False)

    head_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{PENDING_OPERATION_TABLE}.id"), nullable=False)
    # head = relationship("PendingOperationNode", foreign_keys=[head_id], uselist=False)
    tail_id: Mapped[int] = mapped_column(Integer, ForeignKey(f"{PENDING_OPERATION_TABLE}.id"), nullable=False)
    # tail = relationship("PendingOperationNode", foreign_keys=[tail_id], uselist=False)
    starting_serial_num: Mapped[int] = mapped_column(Integer, ForeignKey(f"{CONFIRMED_OPERATION_TABLE}.serial_num"), nullable=False)

