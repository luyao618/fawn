from __future__ import annotations

import uuid

from fawn.services.memory_curator import (
    CuratorTurn,
    MemoryCurator,
    parse_curator_response,
)


def _turn(content: str) -> CuratorTurn:
    return CuratorTurn(
        family_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        user_role="爸爸",
        user_name="爸爸",
        user_content=content,
        assistant_content="好的",
    )


def test_curator_rejects_malformed_output() -> None:
    decision = parse_curator_response("not json", _turn("闲聊一下"))

    assert decision.action == "no_change"
    assert decision.target_file is None


def test_curator_rejects_low_confidence_write() -> None:
    decision = parse_curator_response(
        '{"action":"append","target_file":"Memory.md","confidence":0.2,'
        '"reason":"guess","proposed_content":"可能喜欢早睡","supersedes":null}',
        _turn("感觉也许吧"),
    )

    assert decision.action == "no_change"


def test_curator_explicit_remember_cannot_silent_noop() -> None:
    decision = parse_curator_response(
        '{"action":"no_change","target_file":null,"confidence":0.9,'
        '"reason":"ignored","proposed_content":null,"supersedes":null}',
        _turn("请记住：宝宝睡前喜欢白噪音"),
    )

    assert decision.action == "append"
    assert decision.target_file == "Baby.md"
    assert "白噪音" in (decision.proposed_content or "")


async def test_curator_applies_update_instead_of_duplicate_append(
    memory_root,
    test_family,
    test_user,
) -> None:
    curator = MemoryCurator(memory_root=memory_root)
    await curator.memory.write_memory(
        test_family.id,
        "Memory.md",
        "# 家庭 Memory\n- 宝宝睡前喜欢白噪音",
    )

    decision = await curator.apply_raw_decision(
        '{"action":"update","target_file":"Memory.md","confidence":0.9,'
        '"reason":"correction","proposed_content":"- 宝宝睡前不喜欢白噪音，喜欢安静",'
        '"supersedes":"- 宝宝睡前喜欢白噪音"}',
        CuratorTurn(
            family_id=test_family.id,
            user_id=test_user.id,
            user_role=test_user.role,
            user_name=test_user.display_name,
            user_content="更正一下，宝宝睡前不喜欢白噪音，喜欢安静",
            assistant_content="已更新",
        ),
    )

    content = await curator.memory.read_memory(test_family.id, "Memory.md")
    assert decision.action == "update"
    assert "不喜欢白噪音" in content
    assert content.count("白噪音") == 1
