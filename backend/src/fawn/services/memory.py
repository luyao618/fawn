from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta

from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.config import get_settings
from fawn.llm import create_chat_model
from fawn.models import Conversation, ConversationSummary, Message, ProfileItem


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def check_session_timeout(db: AsyncSession, user_id: uuid.UUID) -> uuid.UUID | None:
    active = await db.scalar(
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.is_active.is_(True))
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
    if datetime.now(UTC) - _aware(last_activity) > timeout:
        return active.id
    return None


def _message_transcript(messages: list[Message]) -> str:
    return "\n".join(f"{message.role}: {message.content}" for message in messages)


async def _generate_summary(messages: list[Message]) -> tuple[str, list[str]]:
    transcript = _message_transcript(messages)
    if not transcript:
        return "", []
    try:
        llm = create_chat_model("summary")
        response = await llm.ainvoke(
            [
                HumanMessage(
                    content=(
                        "Summarize this family baby-care conversation in Chinese. "
                        "Return JSON with keys summary and key_topics.\n\n"
                        f"{transcript}"
                    )
                )
            ]
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
        response = await llm.ainvoke(
            [
                HumanMessage(
                    content=(
                        "Extract durable, factual baby-care related user profile facts from the transcript. "
                        "Avoid subjective inference. Return a JSON array of strings only.\n\n"
                        f"{transcript}"
                    )
                )
            ]
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
        summary, key_topics = await _generate_summary(messages)
        db.add(
            ConversationSummary(
                conversation_id=conversation_id,
                summary=summary or "空对话",
                key_topics=key_topics,
            )
        )

    for content in await _extract_profile_items(messages):
        db.add(
            ProfileItem(
                user_id=conversation.user_id,
                content=content,
                source_conversation_id=conversation_id,
            )
        )

    conversation.is_active = False
    conversation.ended_at = datetime.now(UTC)
    await db.commit()
