from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import (
    DashboardSummary,
    FeedingStatsData,
    GrowthChartData,
    SleepStatsData,
    WHOReferenceLines,
)
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import FeedingRecord, GrowthRecord, SleepRecord, User, WhoGrowthReference
from fawn.services.tracker import NotFound, calculate_age_months, get_default_baby, lms_value_for_z

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


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    try:
        baby = await get_default_baby(db)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    today = dashboard_today()
    age_days = (today - baby.birth_date).days

    latest_growth = await db.scalar(
        select(GrowthRecord).order_by(GrowthRecord.measurement_date.desc()).limit(1)
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
                FeedingRecord.feed_time >= start, FeedingRecord.feed_time < end
            )
        )
    ).scalars()
    feedings = list(feeding_rows)
    total_ml = sum(record.amount_ml or 0 for record in feedings)
    last_feed_time = max((record.feed_time for record in feedings), default=None)

    sleep_rows = (
        await db.execute(
            select(SleepRecord).where(
                SleepRecord.sleep_start >= start, SleepRecord.sleep_start < end
            )
        )
    ).scalars()
    sleeps = list(sleep_rows)
    completed_sleeps = [record for record in sleeps if record.sleep_end is not None]
    total_seconds = sum(
        (record.sleep_end - record.sleep_start).total_seconds() for record in completed_sleeps
    )

    return DashboardSummary(
        baby={
            "name": baby.name,
            "gender": baby.gender,
            "birth_date": baby.birth_date.isoformat(),
            "age_days": age_days,
            "age_display": age_display(age_days),
        },
        latest_growth=latest_growth_payload,
        today_feeding={
            "total_ml": total_ml,
            "count": len(feedings),
            "last_feed_time": last_feed_time.isoformat() if last_feed_time else None,
        },
        today_sleep={
            "total_hours": round(total_seconds / 3600, 2) if completed_sleeps else None,
            "night_wakings": sum(record.night_wakings for record in sleeps) if sleeps else None,
        },
    )


@router.get("/growth-chart", response_model=GrowthChartData)
async def growth_chart(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrowthChartData:
    try:
        baby = await get_default_baby(db)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    records = list(
        (
            await db.execute(select(GrowthRecord).order_by(GrowthRecord.measurement_date.asc()))
        ).scalars()
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


@router.get("/feeding-stats", response_model=FeedingStatsData)
async def feeding_stats(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> FeedingStatsData:
    today = dashboard_today()
    start_date = today - timedelta(days=days - 1)
    start_dt, end_dt = dashboard_range_bounds(start_date, days)
    records = list(
        (
            await db.execute(
                select(FeedingRecord).where(
                    FeedingRecord.feed_time >= start_dt,
                    FeedingRecord.feed_time < end_dt,
                )
            )
        ).scalars()
    )
    daily = []
    for index in range(days):
        current = start_date + timedelta(days=index)
        matching = [record for record in records if dashboard_local_date(record.feed_time) == current]
        daily.append(
            {
                "date": current.isoformat(),
                "total_ml": sum(r.amount_ml or 0 for r in matching),
                "count": len(matching),
            }
        )
    return FeedingStatsData(
        days=days,
        daily=daily,
        average_daily_ml=round(sum(item["total_ml"] for item in daily) / days, 2),
        average_daily_count=round(sum(item["count"] for item in daily) / days, 2),
    )


@router.get("/sleep-stats", response_model=SleepStatsData)
async def sleep_stats(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
) -> SleepStatsData:
    today = dashboard_today()
    start_date = today - timedelta(days=days - 1)
    start_dt, end_dt = dashboard_range_bounds(start_date, days)
    records = list(
        (
            await db.execute(
                select(SleepRecord).where(
                    SleepRecord.sleep_start >= start_dt,
                    SleepRecord.sleep_start < end_dt,
                )
            )
        ).scalars()
    )
    daily = []
    for index in range(days):
        current = start_date + timedelta(days=index)
        matching = [record for record in records if dashboard_local_date(record.sleep_start) == current]
        completed = [record for record in matching if record.sleep_end is not None]
        total_hours = sum((record.sleep_end - record.sleep_start).total_seconds() / 3600 for record in completed)
        daily.append(
            {
                "date": current.isoformat(),
                "total_hours": round(total_hours, 2) if completed else None,
                "night_wakings": sum(record.night_wakings for record in matching) if matching else None,
            }
        )
    recorded_days = [item for item in daily if item["total_hours"] is not None]
    waking_days = [item for item in daily if item["night_wakings"] is not None]
    return SleepStatsData(
        days=days,
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
