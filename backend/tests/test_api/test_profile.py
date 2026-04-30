from __future__ import annotations

import uuid


from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import ProfileItem, User


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


async def test_delete_profile_item(
    client: AsyncClient, auth_headers: dict, test_user: User, db: AsyncSession
):
    item = ProfileItem(user_id=test_user.id, content="To delete")
    db.add(item)
    await db.commit()
    await db.refresh(item)
    response = await client.delete(f"/api/profile/me/{item.id}", headers=auth_headers)
    assert response.status_code == 204


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
