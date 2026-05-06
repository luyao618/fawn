from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import (
    DashboardSummary,
    FeedingStatsData,
    GrowthChartData,
    GrowthReferenceP50,
    SleepStatsData,
    WHOReferenceLines,
)
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import Baby, FeedingRecord, GrowthRecord, SleepRecord, User, WhoGrowthReference
from fawn.services.tracker import (
    NotFound,
    calculate_age_months,
    calculate_growth_reference_value,
    get_default_baby,
    lms_value_for_z,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

PERCENTILE_Z = {
    "p3": -1.8807936081512509,
    "p15": -1.0364333894937898,
    "p50": 0.0,
    "p85": 1.0364333894937898,
    "p97": 1.8807936081512509,
}
MAX_GROWTH_REFERENCE_MONTHS = 6.0
MONTH_PRECISION = Decimal("0.01")
DASHBOARD_TIMEZONE = ZoneInfo("Asia/Shanghai")


def age_display(age_days: int) -> str:
    months = age_days // 30
    days = age_days % 30
    if months <= 0:
        return f"{days}天"
    return f"{months}个月{days}天"


def decimal_float(value: Decimal | int | float | None) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value


def dashboard_today() -> date:
    return datetime.now(DASHBOARD_TIMEZONE).date()


def dashboard_day_bounds(day: date) -> tuple[datetime, datetime]:
    start_local = datetime.combine(day, time.min, tzinfo=DASHBOARD_TIMEZONE)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def dashboard_range_bounds(start_day: date, days: int) -> tuple[datetime, datetime]:
    start_local = datetime.combine(start_day, time.min, tzinfo=DASHBOARD_TIMEZONE)
    end_local = start_local + timedelta(days=days)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def dashboard_local_date(value: datetime) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(DASHBOARD_TIMEZONE).date()


def dashboard_stats_start_date(today: date, birth_date: date | None, days: int) -> date:
    requested_start = today - timedelta(days=days - 1)
    if birth_date is None:
        return requested_start
    return min(today, max(requested_start, birth_date))


def _month_decimal(value: float, rounding: str) -> Decimal:
    clamped = min(MAX_GROWTH_REFERENCE_MONTHS, max(0.0, value))
    return Decimal(str(clamped)).quantize(MONTH_PRECISION, rounding=rounding)


def growth_reference_span_months(
    baby_current_age_months: float, record_ages: list[float]
) -> tuple[Decimal, Decimal]:
    if record_ages:
        start_age = min(record_ages)
        end_age = max(record_ages)
    else:
        start_age = 0.0
        end_age = baby_current_age_months

    start = _month_decimal(start_age, ROUND_FLOOR)
    end = _month_decimal(end_age, ROUND_CEILING)
    if end < start:
        return end, start
    return start, end


def empty_who_reference() -> dict[str, WHOReferenceLines]:
    return {
        indicator: WHOReferenceLines(**{key: [] for key in PERCENTILE_Z})
        for indicator in ("weight", "height", "head")
    }


def baby_summary_payload(baby: Baby, today: date) -> dict:
    age_days = (today - baby.birth_date).days if baby.birth_date is not None else None
    return {
        "name": baby.name,
        "gender": baby.gender,
        "birth_date": baby.birth_date,
        "age_days": age_days,
        "age_display": age_display(age_days) if age_days is not None else None,
    }


def empty_feeding_stats(today: date, days: int) -> FeedingStatsData:
    start_date = today - timedelta(days=days - 1)
    daily = [
        {
            "date": (start_date + timedelta(days=index)).isoformat(),
            "total_ml": 0,
            "breast_duration_min": 0,
            "count": 0,
        }
        for index in range(days)
    ]
    return FeedingStatsData(
        days=days,
        daily=daily,
        average_daily_ml=0.0,
        average_daily_breast_duration_min=0.0,
        average_daily_count=0.0,
    )


def empty_sleep_stats(today: date, days: int) -> SleepStatsData:
    start_date = today - timedelta(days=days - 1)
    return SleepStatsData(
        days=days,
        daily=[
            {
                "date": (start_date + timedelta(days=index)).isoformat(),
                "total_hours": None,
                "night_wakings": None,
            }
            for index in range(days)
        ],
        average_daily_hours=None,
        average_night_wakings=None,
    )


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    try:
        baby = await get_default_baby(db, user.family_id)
    except NotFound:
        return DashboardSummary(
            baby=None,
            latest_growth=None,
            today_feeding={
                "total_ml": 0,
                "breast_duration_min": 0,
                "count": 0,
                "last_feed_time": None,
            },
            today_sleep={"total_hours": None, "night_wakings": None},
        )
    today = dashboard_today()

    latest_growth = await db.scalar(
        select(GrowthRecord)
        .where(GrowthRecord.baby_id == baby.id, GrowthRecord.deleted_at.is_(None))
        .order_by(GrowthRecord.measurement_date.desc())
        .limit(1)
    )
    latest_growth_payload = None
    if latest_growth:
        latest_growth_payload = {
            "date": latest_growth.measurement_date.isoformat(),
            "weight_g": latest_growth.weight_g,
            "weight_percentile": decimal_float(latest_growth.weight_percentile),
            "height_cm": decimal_float(latest_growth.height_cm),
            "height_percentile": decimal_float(latest_growth.height_percentile),
        }

    start, end = dashboard_day_bounds(today)
    feeding_rows = (
        await db.execute(
            select(FeedingRecord).where(
                FeedingRecord.baby_id == baby.id,
                FeedingRecord.deleted_at.is_(None),
                FeedingRecord.feed_time >= start, FeedingRecord.feed_time < end
            )
        )
    ).scalars()
    feedings = list(feeding_rows)
    milk_feedings = [record for record in feedings if record.feed_type != "solid"]
    total_ml = sum(record.amount_ml or 0 for record in milk_feedings if record.feed_type == "formula")
    breast_duration_min = sum(
        record.duration_min or 0 for record in milk_feedings if record.feed_type == "breast"
    )
    last_feed_time = max((record.feed_time for record in milk_feedings), default=None)

    sleep_rows = (
        await db.execute(
            select(SleepRecord).where(
                SleepRecord.baby_id == baby.id,
                SleepRecord.deleted_at.is_(None),
                SleepRecord.sleep_start >= start, SleepRecord.sleep_start < end
            )
        )
    ).scalars()
    sleeps = list(sleep_rows)
    completed_sleeps = [record for record in sleeps if record.sleep_end is not None]
    night_sleeps = [record for record in sleeps if record.sleep_type == "night"]
    total_seconds = sum(
        (record.sleep_end - record.sleep_start).total_seconds() for record in completed_sleeps
    )

    return DashboardSummary(
        baby=baby_summary_payload(baby, today),
        latest_growth=latest_growth_payload,
        today_feeding={
            "total_ml": total_ml,
            "breast_duration_min": breast_duration_min,
            "count": len(milk_feedings),
            "last_feed_time": last_feed_time.isoformat() if last_feed_time else None,
        },
        today_sleep={
            "total_hours": round(total_seconds / 3600, 2) if completed_sleeps else None,
            "night_wakings": (
                sum(record.night_wakings for record in night_sleeps) if night_sleeps else None
            ),
        },
    )


@router.get("/growth-chart", response_model=GrowthChartData)
async def growth_chart(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrowthChartData:
    try:
        baby = await get_default_baby(db, user.family_id)
    except NotFound:
        return GrowthChartData(records=[], who_reference=empty_who_reference())
    records = list(
        (
            await db.execute(
                select(GrowthRecord)
                .where(GrowthRecord.baby_id == baby.id, GrowthRecord.deleted_at.is_(None))
                .order_by(GrowthRecord.measurement_date.asc())
            )
        ).scalars()
    )
    if baby.birth_date is None or baby.gender is None:
        return GrowthChartData(
            records=[
                {
                    "date": record.measurement_date.isoformat(),
                    "weight_g": record.weight_g,
                    "height_cm": decimal_float(record.height_cm),
                    "head_cm": decimal_float(record.head_cm),
                }
                for record in records
            ],
            who_reference=empty_who_reference(),
        )

    record_ages = [calculate_age_months(baby, record.measurement_date) for record in records]
    reference_start_months, reference_end_months = growth_reference_span_months(
        calculate_age_months(baby, dashboard_today()), record_ages
    )
    refs = list(
        (
            await db.execute(
                select(WhoGrowthReference)
                .where(WhoGrowthReference.gender == baby.gender)
                .where(
                    WhoGrowthReference.age_months >= reference_start_months,
                    WhoGrowthReference.age_months <= reference_end_months,
                )
                .order_by(WhoGrowthReference.indicator.asc(), WhoGrowthReference.age_months.asc())
            )
        ).scalars()
    )

    who_reference: dict[str, WHOReferenceLines] = {}
    for indicator in ("weight", "height", "head"):
        lines = {key: [] for key in PERCENTILE_Z}
        for ref in [item for item in refs if item.indicator == indicator]:
            for key, z_score in PERCENTILE_Z.items():
                value = lms_value_for_z(
                    float(ref.l_value), float(ref.m_value), float(ref.s_value), z_score
                )
                if indicator == "weight" and value < 100:
                    value *= 1000
                lines[key].append({"age_months": float(ref.age_months), "value": round(value, 2)})
        who_reference[indicator] = WHOReferenceLines(**lines)

    return GrowthChartData(
        records=[
            {
                "date": record.measurement_date.isoformat(),
                "weight_g": record.weight_g,
                "height_cm": decimal_float(record.height_cm),
                "head_cm": decimal_float(record.head_cm),
            }
            for record in records
        ],
        who_reference=who_reference,
    )


@router.get("/growth-reference-p50", response_model=GrowthReferenceP50 | None)
async def growth_reference_p50(
    measurement_date: date = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrowthReferenceP50 | None:
    try:
        baby = await get_default_baby(db, user.family_id)
    except NotFound:
        return None
    if baby.birth_date is None or baby.gender is None:
        return None

    age_days = (measurement_date - baby.birth_date).days
    values = {
        "weight_g": await calculate_growth_reference_value(db, baby, "weight", measurement_date),
        "height_cm": await calculate_growth_reference_value(db, baby, "height", measurement_date),
        "head_cm": await calculate_growth_reference_value(db, baby, "head", measurement_date),
    }
    return GrowthReferenceP50(
        measurement_date=measurement_date,
        age_days=age_days,
        age_display=age_display(age_days),
        **{key: decimal_float(value) for key, value in values.items()},
    )


@router.get("/feeding-stats", response_model=FeedingStatsData)
async def feeding_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> FeedingStatsData:
    try:
        baby = await get_default_baby(db, user.family_id)
    except NotFound:
        return empty_feeding_stats(dashboard_today(), days)
    today = dashboard_today()
    start_date = dashboard_stats_start_date(today, baby.birth_date, days)
    day_count = (today - start_date).days + 1
    start_dt, end_dt = dashboard_range_bounds(start_date, day_count)
    records = list(
        (
            await db.execute(
                select(FeedingRecord).where(
                    FeedingRecord.baby_id == baby.id,
                    FeedingRecord.deleted_at.is_(None),
                    FeedingRecord.feed_time >= start_dt,
                    FeedingRecord.feed_time < end_dt,
                )
            )
        ).scalars()
    )
    daily = []
    for index in range(day_count):
        current = start_date + timedelta(days=index)
        matching = [record for record in records if dashboard_local_date(record.feed_time) == current]
        milk_matching = [record for record in matching if record.feed_type != "solid"]
        daily.append(
            {
                "date": current.isoformat(),
                "total_ml": sum(
                    r.amount_ml or 0 for r in milk_matching if r.feed_type == "formula"
                ),
                "breast_duration_min": sum(
                    r.duration_min or 0 for r in milk_matching if r.feed_type == "breast"
                ),
                "count": len(milk_matching),
            }
        )
    return FeedingStatsData(
        days=day_count,
        daily=daily,
        average_daily_ml=round(sum(item["total_ml"] for item in daily) / day_count, 2),
        average_daily_breast_duration_min=round(
            sum(item["breast_duration_min"] for item in daily) / day_count, 2
        ),
        average_daily_count=round(sum(item["count"] for item in daily) / day_count, 2),
    )


@router.get("/sleep-stats", response_model=SleepStatsData)
async def sleep_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> SleepStatsData:
    try:
        baby = await get_default_baby(db, user.family_id)
    except NotFound:
        return empty_sleep_stats(dashboard_today(), days)
    today = dashboard_today()
    start_date = dashboard_stats_start_date(today, baby.birth_date, days)
    day_count = (today - start_date).days + 1
    start_dt, end_dt = dashboard_range_bounds(start_date, day_count)
    records = list(
        (
            await db.execute(
                select(SleepRecord).where(
                    SleepRecord.baby_id == baby.id,
                    SleepRecord.deleted_at.is_(None),
                    SleepRecord.sleep_start >= start_dt,
                    SleepRecord.sleep_start < end_dt,
                )
            )
        ).scalars()
    )
    daily = []
    for index in range(day_count):
        current = start_date + timedelta(days=index)
        matching = [record for record in records if dashboard_local_date(record.sleep_start) == current]
        completed = [record for record in matching if record.sleep_end is not None]
        night_sleeps = [record for record in matching if record.sleep_type == "night"]
        total_hours = sum((record.sleep_end - record.sleep_start).total_seconds() / 3600 for record in completed)
        daily.append(
            {
                "date": current.isoformat(),
                "total_hours": round(total_hours, 2) if completed else None,
                "night_wakings": (
                    sum(record.night_wakings for record in night_sleeps) if night_sleeps else None
                ),
            }
        )
    recorded_days = [item for item in daily if item["total_hours"] is not None]
    waking_days = [item for item in daily if item["night_wakings"] is not None]
    return SleepStatsData(
        days=day_count,
        daily=daily,
        average_daily_hours=(
            round(sum(item["total_hours"] for item in recorded_days) / len(recorded_days), 2)
            if recorded_days
            else None
        ),
        average_night_wakings=(
            round(sum(item["night_wakings"] for item in waking_days) / len(waking_days), 2)
            if waking_days
            else None
        ),
    )
