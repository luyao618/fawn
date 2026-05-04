from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field, ValidationError

from fawn.config import get_settings
from fawn.llm import create_chat_model
from fawn.services.long_term_memory import LongTermMemoryService, MemoryTarget, UnknownMemoryTarget

logger = logging.getLogger(__name__)

CuratorAction = Literal["no_change", "append", "update", "compress", "delete_obsolete"]
CuratorTarget = Literal["Soul.md", "Memory.md", "Baby.md", "users/<user_id>.md"]


@dataclass(frozen=True)
class CuratorTurn:
    family_id: uuid.UUID
    user_id: uuid.UUID
    user_role: str
    user_name: str
    user_content: str
    assistant_content: str


class CuratorDecision(BaseModel):
    action: CuratorAction
    target_file: CuratorTarget | None = None
    reason: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    proposed_content: str | None = None
    supersedes: str | None = None


NO_CHANGE = CuratorDecision(
    action="no_change",
    target_file=None,
    reason="No durable memory update",
    confidence=1.0,
    proposed_content=None,
    supersedes=None,
)


EXPLICIT_MEMORY_PATTERN = re.compile(
    r"(请记住|记住|帮我记|记录一下|更新记忆|以后都|以后请|follow this in the future)",
    re.IGNORECASE,
)
UNSAFE_PATTERN = re.compile(r"(诊断|用药|药量|处方|隐私|秘密|出轨|离婚|关系不好)")


def is_explicit_memory_request(text: str) -> bool:
    return bool(EXPLICIT_MEMORY_PATTERN.search(text or ""))


def _fallback_target(text: str) -> CuratorTarget:
    if any(term in text for term in ("以后", "回答", "语气", "称呼", "风格")):
        return "Soul.md"
    if "宝宝" in text:
        return "Baby.md"
    if any(term in text for term in ("家庭", "家里", "爸爸", "妈妈", "奶奶", "爷爷", "外婆", "外公")):
        return "Memory.md"
    return "users/<user_id>.md"


def _fallback_content(text: str) -> str:
    cleaned = re.sub(EXPLICIT_MEMORY_PATTERN, "", text).strip(" ：:，,。")
    return cleaned or text.strip()


def _coerce_target(target_file: str | None) -> CuratorTarget | None:
    if target_file in {"Soul.md", "Memory.md", "Baby.md", "users/<user_id>.md"}:
        return target_file  # type: ignore[return-value]
    if target_file and target_file.startswith("users/") and target_file.endswith(".md"):
        return "users/<user_id>.md"
    return None


def parse_curator_response(raw: str, turn: CuratorTurn) -> CuratorDecision:
    explicit = is_explicit_memory_request(turn.user_content)
    try:
        payload = json.loads(raw)
        if isinstance(payload, list):
            payload = payload[0] if payload else {}
        if not isinstance(payload, dict):
            return NO_CHANGE
        payload["target_file"] = _coerce_target(payload.get("target_file"))
        decision = CuratorDecision.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError):
        return NO_CHANGE

    if decision.action == "no_change":
        if explicit and not UNSAFE_PATTERN.search(turn.user_content):
            return CuratorDecision(
                action="append",
                target_file=_fallback_target(turn.user_content),
                reason="Explicit memory request cannot be silently ignored",
                confidence=0.8,
                proposed_content=_fallback_content(turn.user_content),
                supersedes=None,
            )
        return NO_CHANGE

    if decision.target_file is None:
        return NO_CHANGE
    if decision.confidence < 0.6:
        return NO_CHANGE
    if not decision.proposed_content and decision.action in {"append", "update", "compress"}:
        return NO_CHANGE
    if UNSAFE_PATTERN.search(decision.proposed_content or "") and not explicit:
        return NO_CHANGE
    return decision


def _target_to_memory(target_file: CuratorTarget) -> MemoryTarget:
    if target_file == "Soul.md":
        return MemoryTarget.SOUL
    if target_file == "Memory.md":
        return MemoryTarget.MEMORY
    if target_file == "Baby.md":
        return MemoryTarget.BABY
    if target_file == "users/<user_id>.md":
        return MemoryTarget.USER
    raise UnknownMemoryTarget(target_file)


class MemoryCurator:
    def __init__(
        self,
        *,
        memory_root: Path | str | None = None,
        memory: LongTermMemoryService | None = None,
    ) -> None:
        self.memory = memory or LongTermMemoryService(memory_root)

    async def apply_decision(self, decision: CuratorDecision, turn: CuratorTurn) -> CuratorDecision:
        if decision.action == "no_change" or decision.target_file is None:
            return decision
        target = _target_to_memory(decision.target_file)
        user_id = turn.user_id if target is MemoryTarget.USER else None
        match decision.action:
            case "append":
                await self.memory.append_memory(
                    turn.family_id,
                    target,
                    decision.proposed_content or "",
                    user_id=user_id,
                )
            case "update":
                await self.memory.update_memory(
                    turn.family_id,
                    target,
                    decision.proposed_content or "",
                    supersedes=decision.supersedes,
                    user_id=user_id,
                )
            case "compress":
                await self.memory.write_memory(
                    turn.family_id,
                    target,
                    decision.proposed_content or "",
                    user_id=user_id,
                )
            case "delete_obsolete":
                await self.memory.delete_obsolete(
                    turn.family_id,
                    target,
                    supersedes=decision.supersedes,
                    user_id=user_id,
                )
        return decision

    async def apply_raw_decision(self, raw: str, turn: CuratorTurn) -> CuratorDecision:
        decision = parse_curator_response(raw, turn)
        return await self.apply_decision(decision, turn)

    async def curate_turn(self, turn: CuratorTurn) -> CuratorDecision:
        prompt = (
            "你是 Fawn 的 Memory Curator。判断这轮对话是否需要更新家庭长期 Markdown 记忆。\n"
            "只返回 JSON，不要解释。字段：action, target_file, reason, confidence, "
            "proposed_content, supersedes。\n"
            "action 只能是 no_change, append, update, compress, delete_obsolete。\n"
            "target_file 只能是 Soul.md, Memory.md, Baby.md, users/<user_id>.md 或 null。\n"
            "用户明确要求记住/以后遵守的安全内容不能静默 no_change；纠正已有事实用 update。\n"
            "确定性 tracker 数据、RAG 外部知识、低置信推断、一次性闲聊返回 no_change。\n\n"
            f"当前用户：{turn.user_name}（{turn.user_role}）\n"
            f"用户消息：{turn.user_content}\n"
            f"助手回复：{turn.assistant_content}"
        )
        try:
            llm = create_chat_model("summary")
            response = await asyncio.wait_for(
                llm.ainvoke([HumanMessage(content=prompt)]),
                timeout=get_settings().memory_curator_timeout_seconds,
            )
            raw = (
                response.content
                if isinstance(response.content, str)
                else json.dumps(response.content, ensure_ascii=False)
            )
            return await self.apply_raw_decision(raw, turn)
        except Exception:
            logger.warning("Memory curator failed", exc_info=True)
            return NO_CHANGE
