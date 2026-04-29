from typing import Any

from sqlalchemy import CheckConstraint, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'parent', 'family')", name="ck_users_role"),
    )

    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    permissions: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("""'{"can_upload_photos": true, "can_write_tracker": false}'::jsonb"""),
    )
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    conversations = relationship("Conversation", back_populates="user")
    profile_items = relationship("ProfileItem", back_populates="user")
