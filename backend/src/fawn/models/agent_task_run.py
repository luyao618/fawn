import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class AgentTaskRun(UUIDMixin, TimestampMixin, Base):
    """User-triggered background task run (distinct from short-term `AgentTask`)."""

    __tablename__ = "agent_task_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')",
            name="ck_agent_task_runs_status",
        ),
        Index("idx_agent_task_runs_family_name_status", "family_id", "name", "status"),
        Index("idx_agent_task_runs_family_created", "family_id", "created_at"),
        # DB-level guarantee that only one active run (queued/running) exists per
        # (family, task name). Concurrent POSTs race-insert -> the loser gets a
        # unique-violation that the service maps back to 409 task_run_in_progress.
        Index(
            "uq_agent_task_runs_active_family_name",
            "family_id",
            "name",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running')"),
            sqlite_where=text("status IN ('queued', 'running')"),
        ),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id"), nullable=False
    )
    triggered_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    input: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    output: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    family = relationship("Family")
    triggered_by = relationship("User")
