from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.config import get_settings
from fawn.llm import create_chat_model
from fawn.models import Conversation, ConversationSummary, Message, ProfileItem, User

APP_TIMEZONE = ZoneInfo("Asia/Shanghai")
RolloverReason = Literal["cross_day", "timeout"]


@dataclass
class ConversationResolution:
    conversation: Conversation
    expired_conversation_id: uuid.UUID | None = None
    rollover_reason: RolloverReason | None = None


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _local_date(value: datetime) -> date:
    return _aware(value).astimezone(APP_TIMEZONE).date()


async def check_session_timeout(db: AsyncSession, family_id: uuid.UUID) -> uuid.UUID | None:
    active = await db.scalar(
        select(Conversation)
        .where(Conversation.family_id == family_id, Conversation.is_active.is_(True))
        .order_by(Conversation.started_at.desc())
        .limit(1)
    )
    if active is None:
        return None

    last_message = await db.scalar(
        select(Message)
        .where(Message.conversation_id == active.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    last_activity = last_message.created_at if last_message else active.started_at
    timeout = timedelta(minutes=get_settings().session_timeout_minutes)
    if _utc_now() - _aware(last_activity) > timeout:
        return active.id
    return None


async def _latest_activity(db: AsyncSession, conversation: Conversation) -> datetime:
    last_message = await db.scalar(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    return _aware(last_message.created_at if last_message else conversation.started_at)


def _rollover_reason(last_activity: datetime, now: datetime) -> RolloverReason | None:
    if _local_date(last_activity) != _local_date(now):
        return "cross_day"
    timeout = timedelta(minutes=get_settings().session_timeout_minutes)
    if _aware(now) - _aware(last_activity) > timeout:
        return "timeout"
    return None


async def get_or_create_current_conversation(
    db: AsyncSession,
    user: User,
    *,
    now: datetime | None = None,
) -> ConversationResolution:
    current_time = _aware(now or _utc_now())
    active = await db.scalar(
        select(Conversation)
        .where(Conversation.family_id == user.family_id, Conversation.is_active.is_(True))
        .order_by(Conversation.started_at.desc())
        .limit(1)
    )
    expired_conversation_id: uuid.UUID | None = None
    rollover_reason: RolloverReason | None = None
    if active is not None:
        rollover_reason = _rollover_reason(await _latest_activity(db, active), current_time)
        if rollover_reason is None:
            return ConversationResolution(conversation=active)
        expired_conversation_id = active.id
        await finalize_conversation(db, active.id)

    conversation = Conversation(family_id=user.family_id, user_id=user.id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return ConversationResolution(
        conversation=conversation,
        expired_conversation_id=expired_conversation_id,
        rollover_reason=rollover_reason,
    )


def _message_transcript(messages: list[Message]) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in messages)


async def _generate_summary(messages: list[Message]) -> tuple[str, list[str]]:
    transcript = _message_transcript(messages)
    if not transcript:
        return "", []
    try:
        llm = create_chat_model("summary")
        response = await asyncio.wait_for(
            llm.ainvoke(
                [
                    HumanMessage(
                        content=(
                            "Summarize this family baby-care conversation in Chinese. "
                            "Return JSON with keys summary and key_topics.\n\n"
                            f"{transcript}"
                        )
                    )
                ]
            ),
            timeout=get_settings().llm.request_timeout_seconds,
        )
        raw = (
            response.content
            if isinstance(response.content, str)
            else json.dumps(response.content, ensure_ascii=False)
        )
        data = json.loads(raw)
        return str(data.get("summary") or ""), list(data.get("key_topics") or [])
    except Exception:
        first = messages[0].content if messages else ""
        last = messages[-1].content if messages else ""
        fallback = f"{first[:120]} ... {last[:120]}" if first != last else first[:240]
        return fallback, []


async def _extract_profile_items(messages: list[Message]) -> list[str]:
    transcript = _message_transcript(messages)
    if not transcript:
        return []
    try:
        llm = create_chat_model("summary")
        response = await asyncio.wait_for(
            llm.ainvoke(
                [
                    HumanMessage(
                        content=(
                            "Extract durable, factual baby-care related user profile facts from the transcript. "
                            "Avoid subjective inference. Return a JSON array of strings only.\n\n"
                            f"{transcript}"
                        )
                    )
                ]
            ),
            timeout=get_settings().llm.request_timeout_seconds,
        )
        raw = (
            response.content
            if isinstance(response.content, str)
            else json.dumps(response.content, ensure_ascii=False)
        )
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed if str(item).strip()]
    except Exception:
        return []
    return []


async def finalize_conversation(db: AsyncSession, conversation_id: uuid.UUID) -> None:
    conversation = await db.get(Conversation, conversation_id)
    if conversation is None or not conversation.is_active:
        return

    messages = list(
        (
            await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.asc())
            )
        ).scalars()
    )

    existing_summary = await db.scalar(
        select(ConversationSummary).where(ConversationSummary.conversation_id == conversation_id)
    )
    if existing_summary is None:
        (summary, key_topics), profile_items = await asyncio.gather(
            _generate_summary(messages),
            _extract_profile_items(messages),
        )
        db.add(
            ConversationSummary(
                conversation_id=conversation_id,
                summary=summary or "空对话",
                key_topics=key_topics,
            )
        )
    else:
        profile_items = await _extract_profile_items(messages)

    for content in profile_items:
        db.add(
            ProfileItem(
                family_id=conversation.family_id,
                user_id=conversation.user_id,
                scope="user",
                content=content,
                source_conversation_id=conversation_id,
            )
        )

    conversation.is_active = False
    conversation.ended_at = _utc_now()
    await db.commit()
