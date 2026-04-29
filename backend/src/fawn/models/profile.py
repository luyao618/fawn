import uuid

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class ProfileItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "profile_items"
    __table_args__ = (Index("idx_profile_items_user", "user_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )

    user = relationship("User", back_populates="profile_items")
