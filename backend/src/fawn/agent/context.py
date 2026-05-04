from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.models import Message
from fawn.services.recent_deterministic_context import RecentDeterministicContext
from fawn.services.recent_deterministic_context import build_recent_deterministic_context

APP_TIMEZONE = ZoneInfo("Asia/Shanghai")


@dataclass(frozen=True)
class RecentContextEntry:
    role: str
    content: str
    created_at: datetime
    relative_time: str
    speaker: str
    access_type: str | None = None
    family_role: str | None = None

    def format_line(self) -> str:
        local_time = _local_time(self.created_at)
        time_part = local_time.strftime("%Y-%m-%d %H:%M")
        if self.role == "assistant":
            speaker_part = "管家"
        else:
            labels = [self.speaker]
            if self.access_type:
                labels.append(_access_type_label(self.access_type))
            if self.family_role:
                labels.append(f"角色: {self.family_role}")
            speaker_part = " | ".join(labels)
        return f"[{time_part} | {self.relative_time} | {speaker_part}] {self.content}"


@dataclass(frozen=True)
class ShortTermContext:
    entries: list[RecentContextEntry]
    deterministic_context: RecentDeterministicContext | None = None

    def format_for_prompt(self) -> str:
        blocks: list[str] = []
        if not self.entries:
            message_block = ""
        else:
            lines = "\n".join(entry.format_line() for entry in self.entries)
            message_block = f"<recent-context>\n{lines}\n</recent-context>"
        if message_block:
            blocks.append(message_block)
        if self.deterministic_context is not None:
            deterministic_block = self.deterministic_context.render_for_prompt()
            if deterministic_block:
                blocks.append(deterministic_block)
        return "\n\n".join(blocks)


def _local_time(value: datetime) -> datetime:
    aware = value if value.tzinfo else value.replace(tzinfo=UTC)
    return aware.astimezone(APP_TIMEZONE)


def _relative_time(value: datetime, now: datetime) -> str:
    current = _local_time(now)
    local = _local_time(value)
    seconds = max(0, int((current - local).total_seconds()))
    if seconds < 60:
        return "刚刚"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}分钟前"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}小时前"
    days = hours // 24
    return f"{days}天前"


def _access_type_label(value: str) -> str:
    return {"parent": "父母", "family": "家人", "friend": "朋友"}.get(value, value)


def _message_summary(message: Message, max_chars: int) -> str:
    content = (message.content or "").strip()
    if message.message_type == "image":
        content = f"上传了一张照片。{content}".strip()
    if len(content) <= max_chars:
        return content
    return content[:max_chars].rstrip() + "..."


async def build_short_term_context(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    *,
    family_id: uuid.UUID | None = None,
    exclude_message_id: uuid.UUID | None = None,
    max_messages: int = 20,
    max_chars_per_message: int = 800,
    now: datetime | None = None,
) -> ShortTermContext:
    current = now or datetime.now(APP_TIMEZONE)
    stmt = (
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(max_messages)
    )
    if exclude_message_id is not None:
        stmt = stmt.where(Message.id != exclude_message_id)

    rows = list((await db.execute(stmt)).scalars())
    rows.reverse()

    entries: list[RecentContextEntry] = []
    for message in rows:
        sender = message.sender
        entries.append(
            RecentContextEntry(
                role=message.role,
                content=_message_summary(message, max_chars_per_message),
                created_at=message.created_at,
                relative_time=_relative_time(message.created_at, current),
                speaker=sender.display_name if sender else "用户",
                access_type=sender.access_type if sender else None,
                family_role=sender.role if sender else None,
            )
        )
    deterministic_context = None
    if family_id is not None:
        deterministic_context = await build_recent_deterministic_context(db, family_id, now=current)
    return ShortTermContext(entries=entries, deterministic_context=deterministic_context)
