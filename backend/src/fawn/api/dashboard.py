from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

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
from fawn.services.tracker import NotFound, get_default_baby, lms_value_for_z

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

PERCENTILE_Z = {
    "p3": -1.8807936081512509,
    "p15": -1.0364333894937898,
    "p50": 0.0,
    "p85": 1.0364333894937898,
    "p97": 1.8807936081512509,
}


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


@router.get("/summary", response_model=DashboardSummary)
async def summary(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummary:
    try:
        baby = await get_default_baby(db)
    except NotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    today = date.today()
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

    start = datetime.combine(today, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)
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
    total_seconds = sum(
        (record.sleep_end - record.sleep_start).total_seconds()
        for record in sleeps
        if record.sleep_end is not None
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
            "total_hours": round(total_seconds / 3600, 2),
            "night_wakings": sum(record.night_wakings for record in sleeps),
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
    refs = list(
        (
            await db.execute(
                select(WhoGrowthReference)
                .where(WhoGrowthReference.gender == baby.gender)
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
    today = date.today()
    start_date = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    records = list(
        (
            await db.execute(select(FeedingRecord).where(FeedingRecord.feed_time >= start_dt))
        ).scalars()
    )
    daily = []
    for index in range(days):
        current = start_date + timedelta(days=index)
        matching = [record for record in records if record.feed_time.date() == current]
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
    today = date.today()
    start_date = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time(), tzinfo=UTC)
    records = list(
        (await db.execute(select(SleepRecord).where(SleepRecord.sleep_start >= start_dt))).scalars()
    )
    daily = []
    for index in range(days):
        current = start_date + timedelta(days=index)
        matching = [record for record in records if record.sleep_start.date() == current]
        total_hours = sum(
            (record.sleep_end - record.sleep_start).total_seconds() / 3600
            for record in matching
            if record.sleep_end is not None
        )
        daily.append(
            {
                "date": current.isoformat(),
                "total_hours": round(total_hours, 2),
                "night_wakings": sum(record.night_wakings for record in matching),
            }
        )
    return SleepStatsData(
        days=days,
        daily=daily,
        average_daily_hours=round(sum(item["total_hours"] for item in daily) / days, 2),
        average_night_wakings=round(sum(item["night_wakings"] for item in daily) / days, 2),
    )
