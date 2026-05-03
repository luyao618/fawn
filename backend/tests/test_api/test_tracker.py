from __future__ import annotations

from httpx import AsyncClient

from fawn.models import Baby


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


async def test_create_tracker_record_family_allowed(
    client: AsyncClient, family_auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={"feed_time": "2026-05-02T08:30:00Z", "feed_type": "breast", "duration_min": 12},
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


async def test_create_tracker_record_invalid_payload(
    client: AsyncClient, auth_headers: dict, test_baby: Baby
) -> None:
    response = await client.post(
        "/api/tracker/feeding",
        json={"feed_time": "2026-05-02T08:30:00Z"},
        headers=auth_headers,
    )

    assert response.status_code == 422
