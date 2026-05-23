from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.dashboard import DASHBOARD_TIMEZONE
from fawn.models import Baby, DiaperRecord, User


async def test_create_growth_record(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/growth",
        json={"measurement_date": "2026-05-02", "weight_g": 6200, "height_cm": 61.5},
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["measurement_date"] == "2026-05-02"
    assert data["weight_g"] == 6200
    assert data["height_cm"] == 61.5
    assert data["notes"] is None

    noted_response = await client.post(
        "/api/tracker/growth",
        json={
            "measurement_date": "2026-05-03",
            "weight_g": 6250,
            "notes": "家用体重秤测量",
        },
        headers=auth_headers,
    )

    assert noted_response.status_code == 201
    assert noted_response.json()["notes"] == "家用体重秤测量"


async def test_create_feeding_record(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={
            "feed_time": "2026-05-02T08:30:00Z",
            "feed_type": "formula",
            "amount_ml": 120,
            "notes": "Morning bottle",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["feed_type"] == "formula"
    assert data["amount_ml"] == 120
    assert data["notes"] == "Morning bottle"


async def test_create_sleep_record(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/sleep",
        json={
            "sleep_start": "2026-05-02T09:00:00Z",
            "sleep_end": "2026-05-02T10:20:00Z",
            "sleep_type": "nap",
            "night_wakings": 0,
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["sleep_type"] == "nap"
    assert data["night_wakings"] == 0
    assert data["sleep_end"] is not None


async def test_create_nap_record_ignores_night_wakings(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/sleep",
        json={
            "sleep_start": "2026-05-02T13:00:00Z",
            "sleep_end": "2026-05-02T14:00:00Z",
            "sleep_type": "nap",
            "night_wakings": 3,
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["sleep_type"] == "nap"
    assert data["night_wakings"] == 0


async def test_create_health_record(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/health",
        json={
            "record_date": "2026-05-02",
            "record_type": "checkup",
            "title": "Routine checkup",
            "description": "No concerns",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["record_type"] == "checkup"
    assert data["title"] == "Routine checkup"
    assert data["description"] == "No concerns"


async def test_create_diaper_record(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/diaper",
        json={
            "diaper_time": "2026-05-02T08:30:00Z",
            "diaper_type": "poop",
            "notes": "Morning change",
        },
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["diaper_type"] == "poop"
    assert data["diaper_time"].startswith("2026-05-02T08:30:00")
    assert data["notes"] == "Morning change"


async def test_create_diaper_record_accepts_all_types_and_label_mapping(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    label_to_value = {"大便": "poop", "小便": "pee", "混合": "mixed"}

    for index, (label, diaper_type) in enumerate(label_to_value.items()):
        response = await client.post(
            "/api/tracker/diaper",
            json={
                "diaper_time": f"2026-05-02T0{index}:30:00Z",
                "diaper_type": diaper_type,
                "notes": label,
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        assert response.json()["diaper_type"] == diaper_type
        assert response.json()["notes"] == label


async def test_create_diaper_record_invalid_type(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/diaper",
        json={"diaper_time": "2026-05-02T08:30:00Z", "diaper_type": "wet"},
        headers=auth_headers,
    )

    assert response.status_code == 422


async def test_list_diaper_records_newest_first(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    test_user: User,
) -> None:
    older = DiaperRecord(
        baby_id=test_baby.id,
        recorded_by=test_user.id,
        diaper_time=datetime(2026, 5, 2, 8, 30, tzinfo=UTC),
        diaper_type="pee",
    )
    newer = DiaperRecord(
        baby_id=test_baby.id,
        recorded_by=test_user.id,
        diaper_time=datetime(2026, 5, 2, 10, 30, tzinfo=UTC),
        diaper_type="mixed",
    )
    db.add_all([older, newer])
    await db.commit()

    response = await client.get("/api/tracker/diaper", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert [record["diaper_type"] for record in data] == ["mixed", "pee"]


async def test_list_diaper_records_date_filter_uses_local_day(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    test_user: User,
) -> None:
    target_day = datetime(2026, 5, 2, 0, 30, tzinfo=DASHBOARD_TIMEZONE)
    previous_day = target_day - timedelta(hours=1)
    db.add_all(
        [
            DiaperRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                diaper_time=target_day.astimezone(UTC),
                diaper_type="poop",
            ),
            DiaperRecord(
                baby_id=test_baby.id,
                recorded_by=test_user.id,
                diaper_time=previous_day.astimezone(UTC),
                diaper_type="pee",
            ),
        ]
    )
    await db.commit()

    response = await client.get("/api/tracker/diaper?date=2026-05-02", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert [record["diaper_type"] for record in data] == ["poop"]


async def test_create_tracker_record_family_allowed(
    client: AsyncClient, family_auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={"feed_time": "2026-05-02T08:30:00Z", "feed_type": "breast", "duration_min": 12},
        headers=family_auth_headers,
    )

    assert response.status_code == 201


async def test_diaper_tracker_family_allowed(
    client: AsyncClient, family_auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/diaper",
        json={"diaper_time": "2026-05-02T08:30:00Z", "diaper_type": "pee"},
        headers=family_auth_headers,
    )

    assert response.status_code == 201


async def test_create_tracker_record_friend_forbidden(
    client: AsyncClient, friend_auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={"feed_time": "2026-05-02T08:30:00Z", "feed_type": "breast", "duration_min": 12},
        headers=friend_auth_headers,
    )

    assert response.status_code == 403


async def test_diaper_tracker_friend_forbidden(
    client: AsyncClient, friend_auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/diaper",
        json={"diaper_time": "2026-05-02T08:30:00Z", "diaper_type": "pee"},
        headers=friend_auth_headers,
    )

    assert response.status_code == 403


async def test_create_tracker_record_invalid_payload(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={"feed_time": "2026-05-02T08:30:00Z"},
        headers=auth_headers,
    )

    assert response.status_code == 422


async def test_create_tracker_record_without_baby_returns_profile_cta(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={"feed_time": "2026-05-02T08:30:00Z", "feed_type": "breast", "duration_min": 12},
        headers=auth_headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "请先在家庭页创建宝宝档案"


async def test_create_diaper_record_without_baby_returns_profile_cta(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    response = await client.post(
        "/api/tracker/diaper",
        json={"diaper_time": "2026-05-02T08:30:00Z", "diaper_type": "pee"},
        headers=auth_headers,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "请先在家庭页创建宝宝档案"


async def test_patch_and_delete_diaper_record(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
) -> None:
    created = await client.post(
        "/api/tracker/diaper",
        json={
            "diaper_time": "2026-05-02T08:30:00Z",
            "diaper_type": "poop",
            "notes": "Before update",
        },
        headers=auth_headers,
    )
    assert created.status_code == 201
    record_id = created.json()["id"]

    patched = await client.patch(
        f"/api/tracker/diaper/{record_id}",
        json={"diaper_type": "mixed", "notes": "After update"},
        headers=auth_headers,
    )

    assert patched.status_code == 200
    assert patched.json()["diaper_type"] == "mixed"
    assert patched.json()["notes"] == "After update"

    deleted = await client.delete(f"/api/tracker/diaper/{record_id}", headers=auth_headers)
    assert deleted.status_code == 204

    listed = await client.get("/api/tracker/diaper", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json() == []


async def test_partial_baby_allows_growth_with_null_percentiles(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
) -> None:
    test_baby.gender = None
    test_baby.birth_date = None
    await db.commit()

    response = await client.post(
        "/api/tracker/growth",
        json={"measurement_date": "2026-05-02", "weight_g": 6200},
        headers=auth_headers,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["weight_g"] == 6200
    assert data["weight_percentile"] is None
