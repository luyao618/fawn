from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, User
from fawn.services.long_term_memory import (
    BABY_PROFILE_END,
    BABY_PROFILE_START,
    LongTermMemoryService,
    MemoryTarget,
)


async def test_list_memory_files_includes_family_baby_and_users(
    client: AsyncClient,
    auth_headers: dict,
    test_user: User,
    test_family_user: User,
    test_baby: Baby,
):
    response = await client.get("/api/memory/files", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    ids = {item["id"] for item in data}
    assert {"soul", "memory", "baby", f"user:{test_user.id}", f"user:{test_family_user.id}"} <= ids
    baby = next(item for item in data if item["id"] == "baby")
    assert baby["label"] == "Baby"
    assert baby["can_edit"] is True
    assert next(item for item in data if item["id"] == "memory")["label"] == "Memory"
    assert next(item for item in data if item["id"] == f"user:{test_user.id}")["label"] == "对 Test Admin 的记忆"


async def test_non_parent_can_read_but_not_update_memory_file(
    client: AsyncClient,
    family_auth_headers: dict,
    test_baby: Baby,
):
    read_response = await client.get("/api/memory/files/baby", headers=family_auth_headers)
    write_response = await client.put(
        "/api/memory/files/baby",
        json={"content": "## 宝宝记忆\n奶奶补充"},
        headers=family_auth_headers,
    )

    assert read_response.status_code == 200
    assert read_response.json()["can_edit"] is False
    assert write_response.status_code == 403


async def test_read_baby_memory_includes_structured_section(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response = await client.get("/api/memory/files/baby", headers=auth_headers)

    assert response.status_code == 200
    content = response.json()["content"]
    assert BABY_PROFILE_START in content
    assert BABY_PROFILE_END in content
    assert "## 结构化宝宝档案" in content
    assert "Test Baby" in content
    assert "## 宝宝记忆" in content


async def test_parent_updates_baby_memory_without_changing_db_profile(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
):
    response = await client.put(
        "/api/memory/files/baby",
        json={"content": "## 宝宝记忆\n喜欢白噪音入睡"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    content = response.json()["content"]
    assert BABY_PROFILE_START in content
    assert "Test Baby" in content
    assert "喜欢白噪音入睡" in content
    await db.refresh(test_baby)
    assert test_baby.name == "Test Baby"


async def test_structured_baby_save_refreshes_markdown_section_and_keeps_freeform(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    memory_root,
):
    service = LongTermMemoryService(memory_root)
    await service.write_memory(
        test_baby.family_id,
        MemoryTarget.BABY,
        "## 宝宝记忆\n喜欢白噪音入睡",
    )

    response = await client.patch(
        "/api/baby",
        json={"name": "New Name"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    content = await service.read_memory(test_baby.family_id, MemoryTarget.BABY)
    assert "New Name" in content
    assert "喜欢白噪音入睡" in content
    assert BABY_PROFILE_START in content
    assert BABY_PROFILE_END in content


async def test_memory_file_rejects_path_like_ids(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response = await client.get("/api/memory/files/users/../../escape.md", headers=auth_headers)

    assert response.status_code == 404
