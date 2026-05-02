import csv
import math
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.dependencies import can_write_tracker
from fawn.models import (
    Baby,
    FeedingRecord,
    GrowthRecord,
    HealthRecord,
    SleepRecord,
    User,
    WhoGrowthReference,
)

TrackerType = Literal["growth", "feeding", "sleep", "health"]


class ServiceError(Exception):
    pass


class PermissionDenied(ServiceError):
    pass


class NotFound(ServiceError):
    pass


class ValidationError(ServiceError):
    pass


RECORD_MODELS: dict[str, type] = {
    "growth": GrowthRecord,
    "feeding": FeedingRecord,
    "sleep": SleepRecord,
    "health": HealthRecord,
}

DATE_FIELDS = {
    "growth": GrowthRecord.measurement_date,
    "feeding": FeedingRecord.feed_time,
    "sleep": SleepRecord.sleep_start,
    "health": HealthRecord.record_date,
}


def ensure_tracker_write(user: User) -> None:
    if not can_write_tracker(user):
        raise PermissionDenied("Tracker write permission required")


async def get_default_baby(db: AsyncSession) -> Baby:
    baby = await db.scalar(select(Baby).order_by(Baby.created_at.asc()).limit(1))
    if baby is None:
        raise NotFound("Baby profile not found")
    return baby


def calculate_age_months(baby: Baby, measurement_date: date) -> float:
    age_months = (measurement_date - baby.birth_date).days / 30.4375
    if baby.is_premature and baby.gestational_weeks is not None and baby.gestational_weeks < 37:
        age_months -= (40 - baby.gestational_weeks) / 4.345
    return age_months


def normal_cdf(z_score: float) -> float:
    return 0.5 * (1 + math.erf(z_score / math.sqrt(2)))


def lms_percentile(value: float, l_value: float, m_value: float, s_value: float) -> float:
    if value <= 0 or m_value <= 0 or s_value <= 0:
        raise ValidationError("WHO percentile values must be positive")
    if abs(l_value) < 1e-12:
        z_score = math.log(value / m_value) / s_value
    else:
        z_score = ((value / m_value) ** l_value - 1) / (l_value * s_value)
    return round(normal_cdf(z_score) * 100, 2)


def lms_value_for_z(l_value: float, m_value: float, s_value: float, z_score: float) -> float:
    if abs(l_value) < 1e-12:
        return m_value * math.exp(s_value * z_score)
    return m_value * ((1 + l_value * s_value * z_score) ** (1 / l_value))


def _interpolate(
    left: WhoGrowthReference, right: WhoGrowthReference, age_months: float
) -> tuple[float, float, float]:
    left_age = float(left.age_months)
    right_age = float(right.age_months)
    if abs(right_age - left_age) < 1e-12:
        return float(left.l_value), float(left.m_value), float(left.s_value)
    ratio = (age_months - left_age) / (right_age - left_age)
    values = []
    for field in ("l_value", "m_value", "s_value"):
        left_value = float(getattr(left, field))
        right_value = float(getattr(right, field))
        values.append(left_value + (right_value - left_value) * ratio)
    return values[0], values[1], values[2]


async def calculate_percentile(
    db: AsyncSession,
    baby: Baby,
    indicator: Literal["weight", "height", "head"],
    value: float | int | Decimal | None,
    measurement_date: date,
) -> Decimal | None:
    if value is None:
        return None

    age_months = calculate_age_months(baby, measurement_date)
    if age_months < 0 or age_months > 6:
        return None

    result = await db.execute(
        select(WhoGrowthReference)
        .where(
            WhoGrowthReference.gender == baby.gender,
            WhoGrowthReference.indicator == indicator,
        )
        .order_by(WhoGrowthReference.age_months.asc())
    )
    refs = list(result.scalars())
    if not refs:
        return None

    if age_months < float(refs[0].age_months) or age_months > float(refs[-1].age_months):
        return None

    left = refs[0]
    right = refs[-1]
    for index, ref in enumerate(refs):
        ref_age = float(ref.age_months)
        if math.isclose(ref_age, age_months, abs_tol=1e-9):
            left = right = ref
            break
        if ref_age > age_months:
            left = refs[index - 1] if index else ref
            right = ref
            break

    l_value, m_value, s_value = _interpolate(left, right, age_months)
    numeric_value = float(value)
    if indicator == "weight" and numeric_value > 100:
        numeric_value = numeric_value / 1000
    percentile = lms_percentile(numeric_value, l_value, m_value, s_value)
    return Decimal(str(percentile))


async def apply_growth_percentiles(db: AsyncSession, record: GrowthRecord) -> GrowthRecord:
    baby = await db.get(Baby, record.baby_id)
    if baby is None:
        raise NotFound("Baby profile not found")
    record.weight_percentile = await calculate_percentile(
        db, baby, "weight", record.weight_g, record.measurement_date
    )
    record.height_percentile = await calculate_percentile(
        db, baby, "height", record.height_cm, record.measurement_date
    )
    record.head_percentile = await calculate_percentile(
        db, baby, "head", record.head_cm, record.measurement_date
    )
    return record


async def create_growth_record(
    db: AsyncSession,
    user: User,
    *,
    measurement_date: date,
    weight_g: int | None = None,
    height_cm: float | None = None,
    head_cm: float | None = None,
    baby_id: uuid.UUID | None = None,
    source_conversation_id: uuid.UUID | None = None,
) -> GrowthRecord:
    ensure_tracker_write(user)
    baby = await db.get(Baby, baby_id) if baby_id else await get_default_baby(db)
    if baby is None:
        raise NotFound("Baby profile not found")
    record = GrowthRecord(
        baby_id=baby.id,
        recorded_by=user.id,
        measurement_date=measurement_date,
        weight_g=weight_g,
        height_cm=Decimal(str(height_cm)) if height_cm is not None else None,
        head_cm=Decimal(str(head_cm)) if head_cm is not None else None,
        source_conversation_id=source_conversation_id,
    )
    db.add(record)
    await db.flush()
    await apply_growth_percentiles(db, record)
    await db.commit()
    await db.refresh(record)
    return record


async def create_feeding_record(
    db: AsyncSession,
    user: User,
    *,
    feed_time: datetime,
    feed_type: str,
    amount_ml: int | None = None,
    duration_min: int | None = None,
    notes: str | None = None,
    baby_id: uuid.UUID | None = None,
    source_conversation_id: uuid.UUID | None = None,
) -> FeedingRecord:
    ensure_tracker_write(user)
    baby = await db.get(Baby, baby_id) if baby_id else await get_default_baby(db)
    if baby is None:
        raise NotFound("Baby profile not found")
    record = FeedingRecord(
        baby_id=baby.id,
        recorded_by=user.id,
        feed_time=feed_time,
        feed_type=feed_type,
        amount_ml=amount_ml,
        duration_min=duration_min,
        notes=notes,
        source_conversation_id=source_conversation_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def create_sleep_record(
    db: AsyncSession,
    user: User,
    *,
    sleep_start: datetime,
    sleep_type: str,
    sleep_end: datetime | None = None,
    night_wakings: int = 0,
    notes: str | None = None,
    baby_id: uuid.UUID | None = None,
    source_conversation_id: uuid.UUID | None = None,
) -> SleepRecord:
    ensure_tracker_write(user)
    baby = await db.get(Baby, baby_id) if baby_id else await get_default_baby(db)
    if baby is None:
        raise NotFound("Baby profile not found")
    record = SleepRecord(
        baby_id=baby.id,
        recorded_by=user.id,
        sleep_start=sleep_start,
        sleep_end=sleep_end,
        night_wakings=night_wakings,
        sleep_type=sleep_type,
        notes=notes,
        source_conversation_id=source_conversation_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def create_health_record(
    db: AsyncSession,
    user: User,
    *,
    record_date: date,
    record_type: str,
    title: str,
    description: str | None = None,
    baby_id: uuid.UUID | None = None,
    source_conversation_id: uuid.UUID | None = None,
) -> HealthRecord:
    ensure_tracker_write(user)
    baby = await db.get(Baby, baby_id) if baby_id else await get_default_baby(db)
    if baby is None:
        raise NotFound("Baby profile not found")
    record = HealthRecord(
        baby_id=baby.id,
        recorded_by=user.id,
        record_date=record_date,
        record_type=record_type,
        title=title,
        description=description,
        source_conversation_id=source_conversation_id,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def update_tracker_record(
    db: AsyncSession,
    user: User,
    record_type: TrackerType,
    record_id: uuid.UUID,
    updates: dict[str, Any],
) -> Any:
    ensure_tracker_write(user)
    model = RECORD_MODELS.get(record_type)
    if model is None:
        raise ValidationError("Unknown tracker record type")
    record = await db.get(model, record_id)
    if record is None:
        raise NotFound("Tracker record not found")

    allowed = set(model.__table__.columns.keys()) - {
        "id",
        "baby_id",
        "recorded_by",
        "created_at",
        "updated_at",
        "source_conversation_id",
        "weight_percentile",
        "height_percentile",
        "head_percentile",
    }
    for key, value in updates.items():
        if key in allowed:
            setattr(record, key, value)

    if record_type == "growth":
        await apply_growth_percentiles(db, record)

    await db.commit()
    await db.refresh(record)
    return record


async def delete_tracker_record(
    db: AsyncSession,
    user: User,
    record_type: TrackerType,
    record_id: uuid.UUID,
) -> None:
    ensure_tracker_write(user)
    model = RECORD_MODELS.get(record_type)
    if model is None:
        raise ValidationError("Unknown tracker record type")
    record = await db.get(model, record_id)
    if record is None:
        raise NotFound("Tracker record not found")
    await db.delete(record)
    await db.commit()


def _apply_date_filters(
    stmt: Select[tuple[Any]],
    record_type: str,
    date_value: date | None,
    from_date: date | None,
    to_date: date | None,
) -> Select[tuple[Any]]:
    field = DATE_FIELDS[record_type]
    if date_value:
        if record_type in {"feeding", "sleep"}:
            start = datetime.combine(date_value, time.min, tzinfo=UTC)
            end = datetime.combine(date_value + timedelta(days=1), time.min, tzinfo=UTC)
            return stmt.where(field >= start, field < end)
        return stmt.where(field == date_value)
    if record_type in {"feeding", "sleep"}:
        if from_date:
            stmt = stmt.where(field >= datetime.combine(from_date, time.min, tzinfo=UTC))
        if to_date:
            stmt = stmt.where(
                field < datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=UTC)
            )
        return stmt
    if from_date:
        stmt = stmt.where(field >= from_date)
    if to_date:
        stmt = stmt.where(field <= to_date)
    return stmt


async def query_records(
    db: AsyncSession,
    record_type: TrackerType,
    *,
    date_value: date | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Any]:
    model = RECORD_MODELS.get(record_type)
    if model is None:
        raise ValidationError("Unknown tracker record type")
    stmt = select(model)
    stmt = _apply_date_filters(stmt, record_type, date_value, from_date, to_date)
    stmt = stmt.order_by(DATE_FIELDS[record_type].desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars())


async def query_growth(db: AsyncSession, **kwargs: Any) -> list[GrowthRecord]:
    return await query_records(db, "growth", **kwargs)


async def query_feeding(db: AsyncSession, **kwargs: Any) -> list[FeedingRecord]:
    return await query_records(db, "feeding", **kwargs)


async def query_sleep(db: AsyncSession, **kwargs: Any) -> list[SleepRecord]:
    return await query_records(db, "sleep", **kwargs)


async def query_health(db: AsyncSession, **kwargs: Any) -> list[HealthRecord]:
    return await query_records(db, "health", **kwargs)


async def seed_who_csv(db: AsyncSession, csv_path: Path, idempotent: bool) -> int:
    existing_keys: set[tuple[str, str, Decimal]] = set()
    if idempotent:
        existing_rows = await db.execute(
            select(
                WhoGrowthReference.gender,
                WhoGrowthReference.indicator,
                WhoGrowthReference.age_months,
            )
        )
        existing_keys = {
            (gender, indicator, age_months)
            for gender, indicator, age_months in existing_rows.all()
        }

    rows_added = 0
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            age_months = Decimal(row["age_months"])
            key = (row["gender"].strip(), row["indicator"].strip(), age_months)
            if key in existing_keys:
                continue
            item = WhoGrowthReference(
                gender=key[0],
                indicator=key[1],
                age_months=age_months,
                l_value=Decimal(row.get("l_value") or row.get("l") or row["L"]),
                m_value=Decimal(row.get("m_value") or row.get("m") or row["M"]),
                s_value=Decimal(row.get("s_value") or row.get("s") or row["S"]),
            )
            db.add(item)
            existing_keys.add(key)
            rows_added += 1
    await db.commit()
    return rows_added


def group_by_day(datetimes: list[datetime]) -> dict[date, list[datetime]]:
    grouped: dict[date, list[datetime]] = defaultdict(list)
    for value in datetimes:
        grouped[value.date()].append(value)
    return grouped
