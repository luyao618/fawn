from datetime import date
from decimal import Decimal
import uuid

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class Baby(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "babies"
    __table_args__ = (CheckConstraint("gender IN ('male', 'female')", name="ck_babies_gender"),)

    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("families.id"), nullable=False
    )
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    birth_weight_g: Mapped[int | None] = mapped_column(Integer)
    birth_height_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    birth_head_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    is_premature: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    gestational_weeks: Mapped[int | None] = mapped_column(Integer)

    family = relationship("Family", back_populates="babies")
