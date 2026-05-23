import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class GrowthRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "growth_records"

    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("babies.id"), nullable=False
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    measurement_date: Mapped[date] = mapped_column(Date, nullable=False)
    weight_g: Mapped[int | None] = mapped_column(Integer)
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    head_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    weight_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    height_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    head_percentile: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class FeedingRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "feeding_records"
    __table_args__ = (
        CheckConstraint(
            "feed_type IN ('breast', 'formula', 'solid')", name="ck_feeding_records_feed_type"
        ),
        Index("idx_feeding_records_time", "baby_id", "feed_time"),
    )

    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("babies.id"), nullable=False
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    feed_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    feed_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_ml: Mapped[int | None] = mapped_column(Integer)
    duration_min: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class SleepRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sleep_records"
    __table_args__ = (
        CheckConstraint("sleep_type IN ('nap', 'night')", name="ck_sleep_records_sleep_type"),
        Index("idx_sleep_records_time", "baby_id", "sleep_start"),
    )

    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("babies.id"), nullable=False
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    sleep_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sleep_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    night_wakings: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    sleep_type: Mapped[str] = mapped_column(String(10), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class HealthRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "health_records"
    __table_args__ = (
        CheckConstraint(
            "record_type IN ('vaccination', 'illness', 'checkup')",
            name="ck_health_records_record_type",
        ),
        Index("idx_health_records_date", "baby_id", "record_date"),
    )

    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("babies.id"), nullable=False
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    record_type: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class DiaperRecord(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "diaper_records"
    __table_args__ = (
        CheckConstraint(
            "diaper_type IN ('poop', 'pee', 'mixed')",
            name="ck_diaper_records_diaper_type",
        ),
        Index("idx_diaper_records_time", "baby_id", "diaper_time"),
    )

    baby_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("babies.id"), nullable=False
    )
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    diaper_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    diaper_type: Mapped[str] = mapped_column(String(20), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    source_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id"),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))


class WhoGrowthReference(Base):
    __tablename__ = "who_growth_reference"
    __table_args__ = (
        CheckConstraint("gender IN ('male', 'female')", name="ck_who_growth_reference_gender"),
        CheckConstraint(
            "indicator IN ('weight', 'height', 'head')", name="ck_who_growth_reference_indicator"
        ),
        Index("idx_who_ref_lookup", "gender", "indicator", "age_months", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gender: Mapped[str] = mapped_column(String(10), nullable=False)
    indicator: Mapped[str] = mapped_column(String(10), nullable=False)
    age_months: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    l_value: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    m_value: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    s_value: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
