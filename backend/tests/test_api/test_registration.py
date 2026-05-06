from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, Family, User
from fawn.services.family import normalize_family_name


def registration_payload(**overrides) -> dict:
    payload = {
        "invite_code": "2026",
        "family_name": "晨晨的家",
        "username": "newparent",
        "password": "secret123",
        "display_name": "晨晨爸爸",
        "role": "爸爸",
    }
    payload.update(overrides)
    return payload


async def test_register_creates_family_and_parent_without_baby_or_token(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    response = await client.post("/api/auth/register", json=registration_payload())

    assert response.status_code == 201
    data = response.json()
    assert "access_token" not in data
    assert data["family"]["name"] == "晨晨的家"
    assert data["user"]["username"] == "newparent"
    assert data["user"]["display_name"] == "晨晨爸爸"
    assert data["user"]["access_type"] == "parent"
    assert data["user"]["role"] == "爸爸"
    assert data["user"]["permissions"]["can_write_tracker"] is True
    assert await db.scalar(select(func.count()).select_from(Family)) == 1
    assert await db.scalar(select(func.count()).select_from(User)) == 1
    assert await db.scalar(select(func.count()).select_from(Baby)) == 0


async def test_register_rejects_wrong_invite_without_creating_records(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    response = await client.post(
        "/api/auth/register",
        json=registration_payload(invite_code="wrong"),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "邀请码不正确"
    assert await db.scalar(select(func.count()).select_from(Family)) == 0
    assert await db.scalar(select(func.count()).select_from(User)) == 0


async def test_register_rejects_duplicate_username(
    client: AsyncClient,
    test_user: User,
) -> None:
    response = await client.post(
        "/api/auth/register",
        json=registration_payload(username=test_user.username, family_name="新的家"),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "用户名已存在"


async def test_register_rejects_duplicate_normalized_family_name(
    client: AsyncClient,
    test_family: Family,
) -> None:
    response = await client.post(
        "/api/auth/register",
        json=registration_payload(family_name=f"  {test_family.name.upper()}  "),
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "家庭名称已存在"


async def test_register_rejects_invalid_parent_role(client: AsyncClient) -> None:
    response = await client.post(
        "/api/auth/register",
        json=registration_payload(role="爷爷"),
    )

    assert response.status_code == 422


async def test_create_user_allows_duplicate_display_name_but_rejects_username(
    client: AsyncClient,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    display_response = await client.post(
        "/api/users",
        json={
            "username": "same-display",
            "password": "secret123",
            "display_name": test_user.display_name,
            "access_type": "family",
            "role": "奶奶",
        },
        headers=auth_headers,
    )
    duplicate_response = await client.post(
        "/api/users",
        json={
            "username": test_user.username,
            "password": "secret123",
            "display_name": "另一个昵称",
            "access_type": "family",
            "role": "奶奶",
        },
        headers=auth_headers,
    )

    assert display_response.status_code == 201
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["detail"] == "用户名已存在"


async def test_update_family_normalizes_and_rejects_duplicate_names(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_family: Family,
) -> None:
    other_family = Family(
        id=uuid.uuid4(),
        name="另一个家",
        name_key=normalize_family_name("另一个家"),
    )
    db.add(other_family)
    await db.commit()

    unchanged_response = await client.patch(
        "/api/family",
        json={"name": "  Test   Family  "},
        headers=auth_headers,
    )
    duplicate_response = await client.patch(
        "/api/family",
        json={"name": "  另一个家  "},
        headers=auth_headers,
    )

    assert unchanged_response.status_code == 200
    assert unchanged_response.json()["name"] == "Test Family"
    await db.refresh(test_family)
    assert test_family.name_key == normalize_family_name("Test Family")
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["detail"] == "家庭名称已存在"
