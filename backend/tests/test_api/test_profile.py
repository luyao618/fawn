from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import ProfileItem, User
from fawn.services.long_term_memory import LongTermMemoryService, MemoryTarget


async def test_get_my_profile_empty(client: AsyncClient, auth_headers: dict):
    response = await client.get("/api/profile/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == []


async def test_get_my_profile_with_items(
    client: AsyncClient, auth_headers: dict, test_user: User, db: AsyncSession
):
    item = ProfileItem(user_id=test_user.id, content="Baby likes music")
    db.add(item)
    await db.commit()
    response = await client.get("/api/profile/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["content"] == "Baby likes music"


async def test_update_profile_item(
    client: AsyncClient, auth_headers: dict, test_user: User, db: AsyncSession
):
    item = ProfileItem(user_id=test_user.id, content="Original")
    db.add(item)
    await db.commit()
    await db.refresh(item)
    response = await client.patch(
        f"/api/profile/me/{item.id}",
        json={"content": "Updated"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["content"] == "Updated"


async def test_create_my_profile_item_syncs_markdown(
    client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    memory_root,
):
    response = await client.post(
        "/api/profile/me",
        json={"content": "爸爸喜欢直接给结论"},
        headers=auth_headers,
    )

    assert response.status_code == 201
    content = await LongTermMemoryService(memory_root).read_memory(
        test_user.family_id,
        MemoryTarget.USER,
        user_id=test_user.id,
    )
    assert "爸爸喜欢直接给结论" in content


async def test_create_family_profile_item_syncs_markdown(
    client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    memory_root,
):
    response = await client.post(
        "/api/profile/family",
        json={"content": "家庭晚上八点后尽量安静"},
        headers=auth_headers,
    )

    assert response.status_code == 201
    content = await LongTermMemoryService(memory_root).read_memory(
        test_user.family_id,
        MemoryTarget.MEMORY,
    )
    assert "家庭晚上八点后尽量安静" in content


async def test_profile_markdown_sync_failure_rolls_back_db(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    monkeypatch,
):
    async def fail_sync(*args, **kwargs):
        raise OSError("disk failed")

    monkeypatch.setattr(LongTermMemoryService, "sync_user_profile", fail_sync)

    response = await client.post(
        "/api/profile/me",
        json={"content": "不能只留在 DB"},
        headers=auth_headers,
    )

    assert response.status_code == 500
    rows = list((await db.execute(select(ProfileItem))).scalars())
    assert rows == []


async def test_delete_profile_item(
    client: AsyncClient, auth_headers: dict, test_user: User, db: AsyncSession
):
    item = ProfileItem(user_id=test_user.id, content="To delete")
    db.add(item)
    await db.commit()
    await db.refresh(item)
    response = await client.delete(f"/api/profile/me/{item.id}", headers=auth_headers)
    assert response.status_code == 204


async def test_friend_cannot_write_profile(client: AsyncClient, friend_auth_headers: dict):
    response = await client.post(
        "/api/profile/me",
        json={"content": "Friend preference"},
        headers=friend_auth_headers,
    )
    assert response.status_code == 403


async def test_update_other_users_item_forbidden(
    client: AsyncClient, family_auth_headers: dict, test_user: User, db: AsyncSession
):
    item = ProfileItem(user_id=test_user.id, content="Admin's item")
    db.add(item)
    await db.commit()
    await db.refresh(item)
    response = await client.patch(
        f"/api/profile/me/{item.id}",
        json={"content": "Hacked"},
        headers=family_auth_headers,
    )
    assert response.status_code in {403, 404}


async def test_profile_requires_auth(client: AsyncClient):
    response = await client.get("/api/profile/me")
    assert response.status_code == 401
