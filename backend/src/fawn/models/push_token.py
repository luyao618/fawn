"""Push token registration for Expo Push delivery."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class PushToken(UUIDMixin, TimestampMixin, Base):
    """Expo push token registered by a user device.

    Tokens are unique across the system (one device can only belong to one
    user at a time); re-registering the same token rebinds it to the new
    (user, family) pair.
    """

    __tablename__ = "push_tokens"
    __table_args__ = (
        UniqueConstraint("token", name="uq_push_tokens_token"),
        CheckConstraint(
            "platform IN ('android', 'ios')",
            name="ck_push_tokens_platform",
        ),
        Index("idx_push_tokens_family", "family_id"),
        Index("idx_push_tokens_user", "user_id"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    family = relationship("Family")
    user = relationship("User")
