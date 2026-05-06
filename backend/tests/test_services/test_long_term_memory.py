from __future__ import annotations

import uuid

import pytest

from fawn.models import Conversation, ConversationSummary, ProfileItem, User
from fawn.services.long_term_memory import (
    LongTermMemoryService,
    MemoryTarget,
    UnknownMemoryTarget,
)


async def test_long_term_memory_seeds_family_files(
    db,
    memory_root,
    test_family,
    test_user,
    test_baby,
) -> None:
    db.add_all(
        [
            ProfileItem(
                family_id=test_family.id,
                user_id=test_user.id,
                scope="user",
                content="爸爸偏好简短回答",
            ),
            ProfileItem(
                family_id=test_family.id,
                scope="family",
                content="家庭晚上八点后尽量保持安静",
            ),
        ]
    )
    conversation = Conversation(family_id=test_family.id, user_id=test_user.id)
    db.add(conversation)
    await db.flush()
    db.add(ConversationSummary(conversation_id=conversation.id, summary="曾讨论夜间睡眠节律"))
    await db.commit()

    service = LongTermMemoryService(memory_root)
    context = await service.load_context(db, test_user)

    family_dir = memory_root / "families" / str(test_family.id)
    assert (family_dir / "Soul.md").exists()
    assert (family_dir / "Memory.md").exists()
    assert (family_dir / "Baby.md").exists()
    assert (family_dir / "users" / f"{test_user.id}.md").exists()
    assert "爸爸偏好简短回答" in context.current_user
    assert "家庭晚上八点后尽量保持安静" in context.family
    assert "曾讨论夜间睡眠节律" in context.family
    assert "Test Baby" in context.baby


async def test_long_term_memory_loads_current_user_only(
    db,
    memory_root,
    test_family,
    test_user,
    test_baby,
) -> None:
    other_user = User(
        id=uuid.uuid4(),
        family_id=test_family.id,
        username="other",
        display_name="Other",
        access_type="family",
        role="奶奶",
        password_hash="hash",
        permissions={},
    )
    db.add(other_user)
    await db.commit()

    service = LongTermMemoryService(memory_root)
    await service.write_memory(
        test_family.id,
        MemoryTarget.USER,
        "当前用户只喜欢要点",
        user_id=test_user.id,
    )
    await service.write_memory(
        test_family.id,
        MemoryTarget.USER,
        "其他用户喜欢详细解释",
        user_id=other_user.id,
    )

    context = await service.load_context(db, test_user)

    assert "当前用户只喜欢要点" in context.current_user
    assert "其他用户喜欢详细解释" not in context.render_for_prompt()


async def test_existing_markdown_is_prompt_authority_after_seeding(
    db,
    memory_root,
    test_family,
    test_user,
    test_baby,
) -> None:
    service = LongTermMemoryService(memory_root)
    await service.load_context(db, test_user)
    conversation = Conversation(family_id=test_family.id, user_id=test_user.id)
    db.add(conversation)
    await db.flush()
    db.add(ConversationSummary(conversation_id=conversation.id, summary="后续 DB 摘要"))
    await db.commit()

    context = await service.load_context(db, test_user)

    assert "后续 DB 摘要" not in context.render_for_prompt()


async def test_long_term_memory_enforces_limits(memory_root, test_family, test_user) -> None:
    service = LongTermMemoryService(memory_root)
    await service.write_memory(
        test_family.id,
        MemoryTarget.USER,
        "# 用户画像\n" + ("很长" * 800),
        user_id=test_user.id,
    )

    content = await service.read_memory(test_family.id, MemoryTarget.USER, user_id=test_user.id)

    assert len(content) <= 1000
    assert content.startswith("# 用户画像")


async def test_long_term_memory_rejects_unknown_target(memory_root, test_family) -> None:
    service = LongTermMemoryService(memory_root)

    with pytest.raises(UnknownMemoryTarget):
        await service.read_memory(test_family.id, "users/../../escape.md")  # type: ignore[arg-type]


async def test_long_term_memory_renders_unknown_for_partial_baby(
    db,
    memory_root,
    test_family,
    test_user,
    test_baby,
) -> None:
    test_baby.name = None
    test_baby.gender = None
    test_baby.birth_date = None
    await db.commit()

    context = await LongTermMemoryService(memory_root).load_context(db, test_user)

    assert "- 姓名: 未知" in context.baby
    assert "- 性别: 未知" in context.baby
    assert "- 出生日期: 未知" in context.baby
