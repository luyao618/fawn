import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class ProfileItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "profile_items"
    __table_args__ = (
        CheckConstraint("scope IN ('user', 'family')", name="ck_profile_items_scope"),
        Index("idx_profile_items_user", "user_id"),
        Index("idx_profile_items_family", "family_id", "scope"),
    )

    family_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id")
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default="user", server_default="user")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )

    user = relationship("User", back_populates="profile_items")
