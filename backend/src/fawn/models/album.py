import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, UUIDMixin


class Photo(UUIDMixin, Base):
    __tablename__ = "photos"
    __table_args__ = (Index("idx_photos_time", "baby_id", "taken_at"),)

    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("babies.id"), nullable=False
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    tags = relationship("PhotoTag", back_populates="photo", cascade="all, delete-orphan")


class PhotoTag(UUIDMixin, Base):
    __tablename__ = "photo_tags"
    __table_args__ = (
        CheckConstraint(
            "tag_type IN ('scene', 'expression', 'milestone')", name="ck_photo_tags_tag_type"
        ),
        CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_photo_tags_confidence"),
        Index("idx_photo_tags_photo", "photo_id"),
        Index("idx_photo_tags_type", "tag_type", "tag_value"),
    )

    photo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("photos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag_type: Mapped[str] = mapped_column(String(20), nullable=False)
    tag_value: Mapped[str] = mapped_column(String(200), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    is_confirmed: Mapped[bool] = mapped_column(
        nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    photo = relationship("Photo", back_populates="tags")
