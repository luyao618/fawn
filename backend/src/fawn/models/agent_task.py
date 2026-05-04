import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class AgentTask(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "agent_tasks"
    __table_args__ = (
        CheckConstraint(
            "task_type IN ('tracker_create', 'tracker_update', 'tracker_delete', "
            "'baby_profile_update')",
            name="ck_agent_tasks_task_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'awaiting_confirmation', 'completed', "
            "'cancelled', 'expired')",
            name="ck_agent_tasks_status",
        ),
        CheckConstraint(
            "risk_level IN ('low', 'medium', 'high')",
            name="ck_agent_tasks_risk_level",
        ),
        Index("idx_agent_tasks_family_status", "family_id", "status", "expires_at"),
        Index("idx_agent_tasks_conversation", "conversation_id", "created_at"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id"), nullable=False
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )
    task_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    missing_slots: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    initiated_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    last_updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    family = relationship("Family")
    conversation = relationship("Conversation")
    initiated_by = relationship("User", foreign_keys=[initiated_by_user_id])
    last_updated_by = relationship("User", foreign_keys=[last_updated_by_user_id])
    confirmed_by = relationship("User", foreign_keys=[confirmed_by_user_id])
