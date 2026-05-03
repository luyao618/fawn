from decimal import Decimal
from datetime import UTC, datetime, time, timedelta

from fawn.api.dashboard import DASHBOARD_TIMEZONE, dashboard_today, growth_reference_span_months
from fawn.models import Baby, FeedingRecord, SleepRecord, User, WhoGrowthReference
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


async def test_growth_reference_p50_returns_values_for_measurement_date(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_baby: Baby,
) -> None:
    test_baby.birth_date = dashboard_today() - timedelta(days=15)
    db.add_all(
        [
            WhoGrowthReference(
                gender="male",
                indicator="weight",
                age_months=Decimal("0.00"),
                l_value=Decimal("1.000000"),
                m_value=Decimal("3.200000"),
                s_value=Decimal("0.100000"),
            ),
            WhoGrowthReference(
                gender="male",
                indicator="weight",
                age_months=Decimal("1.00"),
                l_value=Decimal("1.000000"),
                m_value=Decimal("4.200000"),
                s_value=Decimal("0.100000"),
            ),
            WhoGrowthReference(
                gender="male",
                indicator="height",
                age_months=Decimal("0.00"),
                l_value=Decimal("1.000000"),
                m_value=Decimal("50.000000"),
                s_value=Decimal("0.100000"),
            ),
            WhoGrowthReference(
                gender="male",
                indicator="height",
                age_months=Decimal("1.00"),
                l_value=Decimal("1.000000"),
                m_value=Decimal("54.000000"),
                s_value=Decimal("0.100000"),
            ),
            WhoGrowthReference(
                gender="male",
                indicator="head",
                age_months=Decimal("0.00"),
                l_value=Decimal("1.000000"),
                m_value=Decimal("34.000000"),
                s_value=Decimal("0.100000"),
            ),
            WhoGrowthReference(
                gender="male",
                indicator="head",
                age_months=Decimal("1.00"),
                l_value=Decimal("1.000000"),
                m_value=Decimal("37.000000"),
                s_value=Decimal("0.100000"),
            ),
        ]
    )
    await db.commit()

    response = await client.get(
        f"/api/dashboard/growth-reference-p50?measurement_date={dashboard_today().isoformat()}",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["age_days"] == 15
    assert data["age_display"] == "15天"
    assert data["weight_g"] is not None
    assert data["height_cm"] is not None
    assert data["head_cm"] is not None


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


async def test_sleep_stats_counts_night_wakings_only_for_night_sleep(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_baby: Baby,
    test_user: User,
) -> None:
    today = dashboard_today()
    night_start = datetime.combine(today, time(1, 0), tzinfo=DASHBOARD_TIMEZONE)
    nap_start = datetime.combine(today, time(10, 0), tzinfo=DASHBOARD_TIMEZONE)
    db.add_all(
        [
            SleepRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                sleep_start=night_start.astimezone(UTC),
                sleep_end=(night_start + timedelta(hours=2)).astimezone(UTC),
                night_wakings=1,
                sleep_type="night",
            ),
            SleepRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                sleep_start=nap_start.astimezone(UTC),
                sleep_end=(nap_start + timedelta(hours=1)).astimezone(UTC),
                night_wakings=4,
                sleep_type="nap",
            ),
        ]
    )
    await db.commit()

    response = await client.get("/api/dashboard/sleep-stats?days=1", headers=auth_headers)
    summary_response = await client.get("/api/dashboard/summary", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["daily"] == [
        {"date": today.isoformat(), "total_hours": 3.0, "night_wakings": 1}
    ]
    assert data["average_daily_hours"] == 3.0
    assert data["average_night_wakings"] == 1.0

    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["today_sleep"] == {"total_hours": 3.0, "night_wakings": 1}


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
                feed_time=(local_feed_time + timedelta(hours=2)).astimezone(UTC),
                feed_type="breast",
                duration_min=18,
            ),
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=(local_feed_time + timedelta(hours=3)).astimezone(UTC),
                feed_type="solid",
                amount_ml=30,
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
    assert data["daily"] == [
        {"date": today.isoformat(), "total_ml": 60, "breast_duration_min": 18, "count": 2}
    ]
    assert data["average_daily_ml"] == 60.0
    assert data["average_daily_breast_duration_min"] == 18.0
    assert data["average_daily_count"] == 2.0


async def test_stats_date_ranges_do_not_start_before_baby_birth(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_baby: Baby,
    test_user: User,
) -> None:
    today = dashboard_today()
    birth_date = today - timedelta(days=2)
    test_baby.birth_date = birth_date
    pre_birth_time = datetime.combine(birth_date - timedelta(days=1), time(8, 0), tzinfo=DASHBOARD_TIMEZONE)
    birth_time = datetime.combine(birth_date, time(8, 0), tzinfo=DASHBOARD_TIMEZONE)
    db.add_all(
        [
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=pre_birth_time.astimezone(UTC),
                feed_type="formula",
                amount_ml=999,
            ),
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=birth_time.astimezone(UTC),
                feed_type="formula",
                amount_ml=70,
            ),
            FeedingRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                feed_time=(birth_time + timedelta(hours=2)).astimezone(UTC),
                feed_type="breast",
                duration_min=10,
            ),
            SleepRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                sleep_start=pre_birth_time.astimezone(UTC),
                sleep_end=(pre_birth_time + timedelta(hours=2)).astimezone(UTC),
                sleep_type="night",
                night_wakings=3,
            ),
            SleepRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                sleep_start=birth_time.astimezone(UTC),
                sleep_end=(birth_time + timedelta(hours=1, minutes=30)).astimezone(UTC),
                sleep_type="night",
                night_wakings=1,
            ),
        ]
    )
    await db.commit()

    feeding_response = await client.get("/api/dashboard/feeding-stats?days=90", headers=auth_headers)
    sleep_response = await client.get("/api/dashboard/sleep-stats?days=90", headers=auth_headers)

    assert feeding_response.status_code == 200
    feeding = feeding_response.json()
    assert feeding["days"] == 3
    assert [item["date"] for item in feeding["daily"]] == [
        birth_date.isoformat(),
        (birth_date + timedelta(days=1)).isoformat(),
        today.isoformat(),
    ]
    assert feeding["daily"][0] == {
        "date": birth_date.isoformat(),
        "total_ml": 70,
        "breast_duration_min": 10,
        "count": 2,
    }

    assert sleep_response.status_code == 200
    sleep = sleep_response.json()
    assert sleep["days"] == 3
    assert [item["date"] for item in sleep["daily"]] == [
        birth_date.isoformat(),
        (birth_date + timedelta(days=1)).isoformat(),
        today.isoformat(),
    ]
    assert sleep["daily"][0] == {
        "date": birth_date.isoformat(),
        "total_hours": 1.5,
        "night_wakings": 1,
    }


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
