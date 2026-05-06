from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby
from fawn.services.long_term_memory import LongTermMemoryService, MemoryTarget


async def test_get_baby(client: AsyncClient, auth_headers: dict, test_baby: Baby):
    response = await client.get("/api/baby", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Baby"
    assert data["gender"] == "male"


async def test_get_baby_not_found(client: AsyncClient, auth_headers: dict):
    response = await client.get("/api/baby", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() is None


async def test_update_baby_creates_profile_when_missing(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
) -> None:
    response = await client.patch(
        "/api/baby",
        json={"name": None, "gender": None, "birth_date": None},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] is None
    assert data["gender"] is None
    assert data["birth_date"] is None

    baby = await db.scalar(select(Baby))
    assert baby is not None
    assert baby.name is None
    assert baby.gender is None
    assert baby.birth_date is None


async def test_update_baby(client: AsyncClient, auth_headers: dict, test_baby: Baby):
    response = await client.patch(
        "/api/baby",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


async def test_update_baby_persists_explicit_nulls(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
) -> None:
    response = await client.patch(
        "/api/baby",
        json={"name": None, "gender": None, "birth_date": None},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["name"] is None
    assert data["gender"] is None
    assert data["birth_date"] is None
    await db.refresh(test_baby)
    assert test_baby.name is None
    assert test_baby.gender is None
    assert test_baby.birth_date is None


async def test_update_baby_syncs_markdown(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    memory_root,
):
    response = await client.patch(
        "/api/baby",
        json={"name": "New Name"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    content = await LongTermMemoryService(memory_root).read_memory(
        test_baby.family_id,
        MemoryTarget.BABY,
    )
    assert "New Name" in content


async def test_baby_markdown_sync_failure_rolls_back_db(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
):
    async def fail_sync(*args, **kwargs):
        raise OSError("disk failed")

    monkeypatch.setattr(LongTermMemoryService, "sync_baby", fail_sync)

    response = await client.patch(
        "/api/baby",
        json={"name": "DB Only Name"},
        headers=auth_headers,
    )

    assert response.status_code == 500
    await db.refresh(test_baby)
    assert test_baby.name == "Test Baby"


async def test_update_baby_family_forbidden(
    client: AsyncClient, family_auth_headers: dict, test_baby: Baby
):
    response = await client.patch(
        "/api/baby",
        json={"name": "Hacked"},
        headers=family_auth_headers,
    )
    assert response.status_code == 403


async def test_baby_requires_auth(client: AsyncClient):
    response = await client.get("/api/baby")
    assert response.status_code == 401
