from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from fawn.models.base import Base, TimestampMixin, UUIDMixin


class Baby(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "babies"
    __table_args__ = (CheckConstraint("gender IN ('male', 'female')", name="ck_babies_gender"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    gender: Mapped[str] = mapped_column(String(10), nullable=False)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    birth_weight_g: Mapped[int | None] = mapped_column(Integer)
    birth_height_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    birth_head_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    is_premature: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    gestational_weeks: Mapped[int | None] = mapped_column(Integer)
