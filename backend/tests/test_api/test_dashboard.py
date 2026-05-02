from decimal import Decimal
from datetime import UTC, datetime, time, timedelta

from fawn.api.dashboard import DASHBOARD_TIMEZONE, dashboard_today, growth_reference_span_months
from fawn.models import Baby, FeedingRecord, SleepRecord, User
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient


def test_growth_reference_span_matches_record_ages() -> None:
    start, end = growth_reference_span_months(
        baby_current_age_months=5.0,
        record_ages=[0.79, 0.03, 0.851],
    )

    assert start == Decimal("0.03")
    assert end == Decimal("0.86")


def test_growth_reference_span_uses_current_age_without_records() -> None:
    start, end = growth_reference_span_months(baby_current_age_months=0.851, record_ages=[])

    assert start == Decimal("0.00")
    assert end == Decimal("0.86")


async def test_sleep_stats_marks_missing_days_as_no_data(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_baby: Baby,
    test_user: User,
) -> None:
    today = dashboard_today()
    sleep_start = datetime.combine(today, time(1, 0), tzinfo=UTC)
    db.add(
        SleepRecord(
            baby_id=test_baby.id,
            recorded_by=test_user.id,
            sleep_start=sleep_start,
            sleep_end=sleep_start + timedelta(hours=2),
            night_wakings=1,
            sleep_type="night",
        )
    )
    await db.commit()

    response = await client.get("/api/dashboard/sleep-stats?days=2", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["daily"][0]["total_hours"] is None
    assert data["daily"][0]["night_wakings"] is None
    assert data["daily"][1]["total_hours"] == 2.0
    assert data["average_daily_hours"] == 2.0
    assert data["average_night_wakings"] == 1.0


async def test_feeding_stats_uses_local_day_and_excludes_future_records(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_baby: Baby,
    test_user: User,
) -> None:
    today = dashboard_today()
    local_feed_time = datetime.combine(today, time(0, 30), tzinfo=DASHBOARD_TIMEZONE)
    future_feed_time = datetime.combine(
        today + timedelta(days=1), time(0, 30), tzinfo=DASHBOARD_TIMEZONE
    )
    db.add_all(
        [
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=local_feed_time.astimezone(UTC),
                feed_type="formula",
                amount_ml=60,
            ),
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=future_feed_time.astimezone(UTC),
                feed_type="formula",
                amount_ml=999,
            ),
        ]
    )
    await db.commit()

    response = await client.get("/api/dashboard/feeding-stats?days=1", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["daily"] == [{"date": today.isoformat(), "total_ml": 60, "count": 1}]
    assert data["average_daily_ml"] == 60.0
    assert data["average_daily_count"] == 1.0


async def test_dashboard_summary_marks_today_sleep_as_no_data(
    client: AsyncClient,
    auth_headers: dict[str, str],
    test_baby: Baby,
) -> None:
    response = await client.get("/api/dashboard/summary", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["today_sleep"]["total_hours"] is None
    assert data["today_sleep"]["night_wakings"] is None
