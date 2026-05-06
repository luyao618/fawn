from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.config import get_settings
from fawn.models import Baby, Conversation, ConversationSummary, ProfileItem, User


class LongTermMemoryError(Exception):
    pass


class UnknownMemoryTarget(LongTermMemoryError):
    pass


class MissingUserTarget(LongTermMemoryError):
    pass


class MemoryTarget(StrEnum):
    SOUL = "Soul.md"
    MEMORY = "Memory.md"
    BABY = "Baby.md"
    USER = "users/<user_id>.md"


MEMORY_LIMITS: dict[MemoryTarget, int] = {
    MemoryTarget.SOUL: 3000,
    MemoryTarget.MEMORY: 3000,
    MemoryTarget.BABY: 2000,
    MemoryTarget.USER: 1000,
}


DEFAULT_SOUL = """# Soul
- 你是 Fawn，一个服务于当前家庭的中文育儿助手。
- 你优先关注宝宝安全、家庭上下文和用户明确提出的长期偏好。
- 医疗、用药、异常症状相关问题必须提醒以医生意见为准。
- 不确定的信息不要写入长期记忆；用户明确要求记住的安全内容需要记录。
"""

BABY_PROFILE_START = "<!-- FAWN:BABY_PROFILE:START -->"
BABY_PROFILE_END = "<!-- FAWN:BABY_PROFILE:END -->"
DEFAULT_BABY_MEMORY = "## 宝宝记忆\n暂无宝宝记忆"


@dataclass(frozen=True)
class LongTermMemoryContext:
    soul: str
    family: str
    baby: str
    current_user: str

    def render_for_prompt(self) -> str:
        return (
            "## Agent Soul\n"
            f"{self.soul}\n\n"
            "## 家庭 Memory\n"
            f"{self.family}\n\n"
            "## 宝宝档案\n"
            f"{self.baby}\n\n"
            "## 当前用户画像\n"
            f"{self.current_user}"
        )


def _coerce_uuid(value: uuid.UUID | str) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def normalize_target(target: MemoryTarget | str) -> MemoryTarget:
    if isinstance(target, MemoryTarget):
        return target
    for candidate in MemoryTarget:
        if target == candidate.value or target == candidate.name:
            return candidate
    if target == "User.md":
        return MemoryTarget.USER
    raise UnknownMemoryTarget(f"Unknown memory target: {target}")


def _trim_to_limit(content: str, limit: int) -> str:
    if len(content) <= limit:
        return content
    lines = content.splitlines()
    heading = lines[0] if lines and lines[0].startswith("#") else ""
    marker = "\n\n...（已压缩）\n"
    if heading:
        budget = max(0, limit - len(heading) - len(marker))
        return f"{heading}{marker}{content[-budget:]}"[:limit]
    return content[-limit:]


def _trim_baby_markdown_to_limit(content: str, limit: int) -> str:
    if len(content) <= limit:
        return content
    start_index = content.find(BABY_PROFILE_START)
    end_index = content.find(BABY_PROFILE_END)
    if start_index < 0 or end_index < start_index:
        return _trim_to_limit(content, limit)

    section_end = end_index + len(BABY_PROFILE_END)
    section = content[start_index:section_end].strip()
    freeform = f"{content[:start_index]}\n{content[section_end:]}".strip()
    marker = "\n\n...（宝宝记忆已压缩）\n"
    budget = max(0, limit - len(section) - len(marker) - 1)
    tail = freeform[-budget:] if budget else ""
    return f"{section}{marker}{tail}".strip()[:limit]


def _fit_to_limit(content: str, target: MemoryTarget, limit: int) -> str:
    if target is MemoryTarget.BABY:
        return _trim_baby_markdown_to_limit(content, limit)
    return _trim_to_limit(content, limit)


def _bullet_lines(items: list[str], empty_text: str) -> str:
    values = [item.strip() for item in items if item and item.strip()]
    if not values:
        return empty_text
    return "\n".join(f"- {value}" for value in values)


def _format_baby_value(value: object | None, suffix: str = "") -> str:
    if value is None or value == "":
        return "未知"
    return f"{value}{suffix}"


def _render_baby_profile_section(baby: Baby | None) -> str:
    if baby is None:
        name = gender = birth_date = birth_weight = birth_height = birth_head = premature = weeks = "未知"
    else:
        gender = {"male": "男", "female": "女"}.get(baby.gender or "", "未知")
        name = _format_baby_value(baby.name)
        birth_date = _format_baby_value(
            baby.birth_date.isoformat() if baby.birth_date is not None else None
        )
        birth_weight = _format_baby_value(baby.birth_weight_g, "g")
        birth_height = _format_baby_value(baby.birth_height_cm, "cm")
        birth_head = _format_baby_value(baby.birth_head_cm, "cm")
        premature = "早产" if baby.is_premature else "足月"
        weeks = _format_baby_value(baby.gestational_weeks)
    synced_at = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
    return (
        f"{BABY_PROFILE_START}\n"
        "## 结构化宝宝档案\n"
        f"- 姓名: {name}\n"
        f"- 性别: {gender}\n"
        f"- 出生日期: {birth_date}\n"
        f"- 出生体重: {birth_weight}\n"
        f"- 出生身长: {birth_height}\n"
        f"- 出生头围: {birth_head}\n"
        f"- 是否早产: {premature}\n"
        f"- 孕周: {weeks}\n"
        f"- 档案同步时间: {synced_at}\n"
        f"{BABY_PROFILE_END}"
    )


def _without_baby_profile_section(content: str) -> str:
    start_index = content.find(BABY_PROFILE_START)
    end_index = content.find(BABY_PROFILE_END)
    if start_index < 0 or end_index < start_index:
        return content.strip()
    section_end = end_index + len(BABY_PROFILE_END)
    return f"{content[:start_index]}\n{content[section_end:]}".strip()


def _legacy_baby_profile_only(content: str) -> bool:
    lines = [line.strip() for line in content.strip().splitlines() if line.strip()]
    if not lines:
        return True
    allowed_prefixes = (
        "# 宝宝档案",
        "- 姓名",
        "- 性别",
        "- 出生日期",
        "- 出生体重",
        "- 出生身长",
        "- 出生头围",
        "- 是否早产",
        "- 孕周",
        "暂无宝宝档案",
    )
    return all(any(line.startswith(prefix) for prefix in allowed_prefixes) for line in lines)


def _normalize_baby_freeform(content: str) -> str:
    freeform = _without_baby_profile_section(content)
    if _legacy_baby_profile_only(freeform):
        return DEFAULT_BABY_MEMORY
    if "## 宝宝记忆" in freeform:
        return freeform.strip()
    return f"## 宝宝记忆\n{freeform.strip()}"


def render_baby_markdown(baby: Baby | None, existing_content: str = "") -> str:
    return f"{_render_baby_profile_section(baby)}\n\n{_normalize_baby_freeform(existing_content)}"


class LongTermMemoryService:
    _locks: dict[Path, asyncio.Lock] = {}

    def __init__(self, memory_root: Path | str | None = None) -> None:
        self.memory_root = Path(memory_root or get_settings().memory_root)

    def family_dir(self, family_id: uuid.UUID | str) -> Path:
        family_uuid = _coerce_uuid(family_id)
        return self.memory_root / "families" / str(family_uuid)

    def target_path(
        self,
        family_id: uuid.UUID | str,
        target: MemoryTarget | str,
        *,
        user_id: uuid.UUID | str | None = None,
    ) -> Path:
        normalized = normalize_target(target)
        base = self.family_dir(family_id)
        if normalized is MemoryTarget.USER:
            if user_id is None:
                raise MissingUserTarget("user_id is required for user memory")
            return base / "users" / f"{_coerce_uuid(user_id)}.md"
        return base / normalized.value

    def _lock_for(self, path: Path) -> asyncio.Lock:
        resolved = path.resolve()
        if resolved not in self._locks:
            self._locks[resolved] = asyncio.Lock()
        return self._locks[resolved]

    async def _write_file(self, path: Path, content: str, target: MemoryTarget) -> str:
        fitted = _fit_to_limit(content.strip() + "\n", target, MEMORY_LIMITS[target])
        async with self._lock_for(path):
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = path.with_name(f".{path.name}.{uuid.uuid4()}.tmp")
            try:
                tmp_path.write_text(fitted, encoding="utf-8")
                os.replace(tmp_path, path)
            finally:
                if tmp_path.exists():
                    tmp_path.unlink()
        return fitted

    async def write_memory(
        self,
        family_id: uuid.UUID | str,
        target: MemoryTarget | str,
        content: str,
        *,
        user_id: uuid.UUID | str | None = None,
    ) -> str:
        normalized = normalize_target(target)
        path = self.target_path(family_id, normalized, user_id=user_id)
        return await self._write_file(path, content, normalized)

    async def read_memory(
        self,
        family_id: uuid.UUID | str,
        target: MemoryTarget | str,
        *,
        user_id: uuid.UUID | str | None = None,
    ) -> str:
        normalized = normalize_target(target)
        path = self.target_path(family_id, normalized, user_id=user_id)
        if not path.exists():
            await self.write_memory(
                family_id,
                normalized,
                self._default_content(normalized),
                user_id=user_id,
            )
        return _fit_to_limit(
            path.read_text(encoding="utf-8"),
            normalized,
            MEMORY_LIMITS[normalized],
        )

    async def ensure_file(
        self,
        family_id: uuid.UUID | str,
        target: MemoryTarget | str,
        content: str,
        *,
        user_id: uuid.UUID | str | None = None,
    ) -> None:
        path = self.target_path(family_id, target, user_id=user_id)
        if not path.exists():
            await self.write_memory(family_id, target, content, user_id=user_id)

    def _default_content(self, target: MemoryTarget) -> str:
        match target:
            case MemoryTarget.SOUL:
                return DEFAULT_SOUL
            case MemoryTarget.MEMORY:
                return "# 家庭 Memory\n暂无家庭记忆"
            case MemoryTarget.BABY:
                return render_baby_markdown(None)
            case MemoryTarget.USER:
                return "# 用户画像\n暂无用户画像"

    async def _seed_user_profile(self, db: AsyncSession, user: User) -> str:
        rows = list(
            (
                await db.execute(
                    select(ProfileItem)
                    .where(ProfileItem.user_id == user.id, ProfileItem.scope == "user")
                    .order_by(ProfileItem.created_at.asc())
                )
            ).scalars()
        )
        return "# 用户画像\n" + _bullet_lines([item.content for item in rows], "暂无用户画像")

    async def _seed_family_memory(self, db: AsyncSession, family_id: uuid.UUID) -> str:
        profile_items = list(
            (
                await db.execute(
                    select(ProfileItem)
                    .where(ProfileItem.family_id == family_id, ProfileItem.scope == "family")
                    .order_by(ProfileItem.created_at.asc())
                )
            ).scalars()
        )
        summaries = list(
            (
                await db.execute(
                    select(ConversationSummary)
                    .join(Conversation, Conversation.id == ConversationSummary.conversation_id)
                    .where(Conversation.family_id == family_id)
                    .order_by(ConversationSummary.created_at.desc())
                    .limit(get_settings().summary_max_recent)
                )
            ).scalars()
        )
        lines = [item.content for item in profile_items] + [summary.summary for summary in summaries]
        return "# 家庭 Memory\n" + _bullet_lines(lines, "暂无家庭记忆")

    async def _seed_baby(self, db: AsyncSession, family_id: uuid.UUID) -> str:
        baby = await db.scalar(
            select(Baby).where(Baby.family_id == family_id).order_by(Baby.created_at.asc()).limit(1)
        )
        return render_baby_markdown(baby)

    async def _get_baby(self, db: AsyncSession, family_id: uuid.UUID) -> Baby | None:
        return await db.scalar(
            select(Baby).where(Baby.family_id == family_id).order_by(Baby.created_at.asc()).limit(1)
        )

    async def ensure_baby_memory(self, db: AsyncSession, family_id: uuid.UUID) -> None:
        path = self.target_path(family_id, MemoryTarget.BABY)
        if not path.exists():
            await self.write_memory(
                family_id,
                MemoryTarget.BABY,
                render_baby_markdown(await self._get_baby(db, family_id)),
            )
            return

        content = path.read_text(encoding="utf-8")
        if BABY_PROFILE_START not in content or BABY_PROFILE_END not in content:
            await self.write_memory(
                family_id,
                MemoryTarget.BABY,
                render_baby_markdown(await self._get_baby(db, family_id), content),
            )

    async def ensure_family_memory_files(self, db: AsyncSession, family_id: uuid.UUID) -> list[User]:
        await self.ensure_file(family_id, MemoryTarget.SOUL, DEFAULT_SOUL)
        await self.ensure_file(
            family_id,
            MemoryTarget.MEMORY,
            await self._seed_family_memory(db, family_id),
        )
        await self.ensure_baby_memory(db, family_id)
        users = list(
            (
                await db.execute(
                    select(User)
                    .where(User.family_id == family_id, User.deleted_at.is_(None))
                    .order_by(User.created_at.asc())
                )
            ).scalars()
        )
        for user in users:
            await self.ensure_file(
                family_id,
                MemoryTarget.USER,
                await self._seed_user_profile(db, user),
                user_id=user.id,
            )
        return users

    async def ensure_family_memory(self, db: AsyncSession, user: User) -> None:
        await self.ensure_file(user.family_id, MemoryTarget.SOUL, DEFAULT_SOUL)
        await self.ensure_file(
            user.family_id,
            MemoryTarget.MEMORY,
            await self._seed_family_memory(db, user.family_id),
        )
        await self.ensure_baby_memory(db, user.family_id)
        await self.ensure_file(
            user.family_id,
            MemoryTarget.USER,
            await self._seed_user_profile(db, user),
            user_id=user.id,
        )

    async def load_context(self, db: AsyncSession, user: User) -> LongTermMemoryContext:
        await self.ensure_family_memory(db, user)
        return LongTermMemoryContext(
            soul=await self.read_memory(user.family_id, MemoryTarget.SOUL),
            family=await self.read_memory(user.family_id, MemoryTarget.MEMORY),
            baby=await self.read_memory(user.family_id, MemoryTarget.BABY),
            current_user=await self.read_memory(
                user.family_id,
                MemoryTarget.USER,
                user_id=user.id,
            ),
        )

    async def sync_user_profile(
        self, db: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID
    ) -> str:
        user = await db.get(User, user_id)
        if user is None:
            content = "# 用户画像\n暂无用户画像"
        else:
            content = await self._seed_user_profile(db, user)
        return await self.write_memory(family_id, MemoryTarget.USER, content, user_id=user_id)

    async def sync_family_memory(self, db: AsyncSession, family_id: uuid.UUID) -> str:
        return await self.write_memory(
            family_id,
            MemoryTarget.MEMORY,
            await self._seed_family_memory(db, family_id),
        )

    async def sync_baby(self, db: AsyncSession, family_id: uuid.UUID) -> str:
        path = self.target_path(family_id, MemoryTarget.BABY)
        existing = path.read_text(encoding="utf-8") if path.exists() else ""
        return await self.write_memory(
            family_id,
            MemoryTarget.BABY,
            render_baby_markdown(await self._get_baby(db, family_id), existing),
        )

    async def write_baby_memory(
        self,
        db: AsyncSession,
        family_id: uuid.UUID,
        content: str,
    ) -> str:
        return await self.write_memory(
            family_id,
            MemoryTarget.BABY,
            render_baby_markdown(await self._get_baby(db, family_id), content),
        )

    async def append_memory(
        self,
        family_id: uuid.UUID,
        target: MemoryTarget | str,
        content: str,
        *,
        user_id: uuid.UUID | None = None,
    ) -> str:
        current = await self.read_memory(family_id, target, user_id=user_id)
        line = content.strip()
        if line and not line.startswith(("#", "-", "*")):
            line = f"- {line}"
        if line in current:
            return current
        return await self.write_memory(
            family_id,
            target,
            f"{current.rstrip()}\n{line}",
            user_id=user_id,
        )

    async def update_memory(
        self,
        family_id: uuid.UUID,
        target: MemoryTarget | str,
        content: str,
        *,
        supersedes: str | None = None,
        user_id: uuid.UUID | None = None,
    ) -> str:
        current = await self.read_memory(family_id, target, user_id=user_id)
        replacement = content.strip()
        if supersedes and supersedes in current:
            updated = current.replace(supersedes, replacement, 1)
        elif replacement in current:
            updated = current
        else:
            updated = f"{current.rstrip()}\n{replacement}"
        return await self.write_memory(family_id, target, updated, user_id=user_id)

    async def delete_obsolete(
        self,
        family_id: uuid.UUID,
        target: MemoryTarget | str,
        *,
        supersedes: str | None,
        user_id: uuid.UUID | None = None,
    ) -> str:
        current = await self.read_memory(family_id, target, user_id=user_id)
        updated = current.replace(supersedes, "", 1) if supersedes else current
        return await self.write_memory(family_id, target, updated, user_id=user_id)
