from __future__ import annotations

import base64
import json
import mimetypes
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.agent.graph import get_agent_graph
from fawn.agent.prompts import build_system_prompt
from fawn.api.schemas import (
    ChatImageResponse,
    ConversationDetail,
    ConversationRead,
    MessageRead,
    PaginatedResponse,
    SendMessageRequest,
)
from fawn.config import get_settings
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import Baby, Conversation, ConversationSummary, Message, ProfileItem, User
from fawn.services.memory import check_session_timeout, finalize_conversation
from fawn.services.storage import get_bytes, put_bytes

router = APIRouter(prefix="/chat", tags=["chat"])


async def _get_user_conversation(
    db: AsyncSession, user: User, conversation_id: uuid.UUID
) -> Conversation:
    conversation = await db.get(Conversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


async def _conversation_read(db: AsyncSession, conversation: Conversation) -> ConversationRead:
    summary = await db.scalar(
        select(ConversationSummary.summary).where(
            ConversationSummary.conversation_id == conversation.id
        )
    )
    message_count = await db.scalar(
        select(func.count()).select_from(Message).where(Message.conversation_id == conversation.id)
    )
    return ConversationRead(
        id=conversation.id,
        started_at=conversation.started_at,
        ended_at=conversation.ended_at,
        is_active=conversation.is_active,
        summary=summary,
        message_count=message_count or 0,
    )


@router.post("/conversations", response_model=ConversationRead)
async def create_conversation(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationRead:
    conversation = Conversation(user_id=user.id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return await _conversation_read(db, conversation)


@router.get("/conversations", response_model=PaginatedResponse)
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse:
    offset = (page - 1) * page_size
    total = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.user_id == user.id)
    )
    conversations = list(
        (
            await db.execute(
                select(Conversation)
                .where(Conversation.user_id == user.id)
                .order_by(Conversation.started_at.desc())
                .limit(page_size)
                .offset(offset)
            )
        ).scalars()
    )
    return PaginatedResponse(
        items=[
            (await _conversation_read(db, conversation)).model_dump(mode="json")
            for conversation in conversations
        ],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    conversation = await _get_user_conversation(db, user, conversation_id)
    messages = list(
        (
            await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.asc())
            )
        ).scalars()
    )
    return ConversationDetail(
        conversation=await _conversation_read(db, conversation),
        messages=[MessageRead.model_validate(message) for message in messages],
    )


async def _search_messages(
    query: str,
    user: User,
    db: AsyncSession,
    page: int,
    page_size: int,
) -> PaginatedResponse:
    offset = (page - 1) * page_size
    base = (
        select(Message, Conversation.started_at.label("conversation_started_at"))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user.id, Message.content.ilike(f"%{query}%"))
    )
    total = await db.scalar(
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == user.id, Message.content.ilike(f"%{query}%"))
    )
    rows = list(
        (
            await db.execute(
                base.order_by(Message.created_at.desc()).limit(page_size).offset(offset)
            )
        ).all()
    )
    items = []
    for message, conversation_started_at in rows:
        data = MessageRead.model_validate(message).model_dump(mode="json")
        data["conversation_started_at"] = conversation_started_at.isoformat()
        items.append(data)
    return PaginatedResponse(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/search", response_model=PaginatedResponse)
async def search_messages(
    q: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse:
    return await _search_messages(q, user, db, page, page_size)


@router.get("/messages/search", response_model=PaginatedResponse)
async def search_messages_compat(
    q: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse:
    return await _search_messages(q, user, db, page, page_size)


async def _prompt_context(
    db: AsyncSession, user: User
) -> tuple[Baby | None, list[ProfileItem], list[ConversationSummary]]:
    baby = await db.scalar(select(Baby).order_by(Baby.created_at.asc()).limit(1))
    profile_items = list(
        (await db.execute(select(ProfileItem).where(ProfileItem.user_id == user.id))).scalars()
    )
    summaries = list(
        (
            await db.execute(
                select(ConversationSummary)
                .join(Conversation, Conversation.id == ConversationSummary.conversation_id)
                .where(Conversation.user_id == user.id)
                .order_by(ConversationSummary.created_at.desc())
                .limit(get_settings().summary_max_recent)
            )
        ).scalars()
    )
    return baby, profile_items, summaries


def _chat_image_key(conversation_id: uuid.UUID, filename: str) -> str:
    return f"chat-images/{conversation_id}/{filename}"


def _url_to_storage_key(conversation_id: uuid.UUID, image_url: str) -> str:
    filename = Path(image_url).name
    return _chat_image_key(conversation_id, filename)


def _human_message(content: str, conversation_id: uuid.UUID, image_url: str | None) -> HumanMessage:
    if not image_url:
        return HumanMessage(content=content)
    storage_key = _url_to_storage_key(conversation_id, image_url)
    data = get_bytes(storage_key)
    mime_type = mimetypes.guess_type(image_url)[0] or "image/jpeg"
    encoded = base64.b64encode(data).decode("ascii")
    return HumanMessage(
        content=[
            {"type": "text", "text": content},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{encoded}"}},
        ]
    )


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


def _message_type_for(content: str) -> str:
    safety_terms = ("以医生意见为准", "就医", "咨询医生", "医生")
    return "safety_alert" if any(term in content for term in safety_terms) else "text"


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await _get_user_conversation(db, user, conversation_id)

    async def event_stream():
        expired_conversation_id = await check_session_timeout(db, user.id)
        if expired_conversation_id:
            await finalize_conversation(db, expired_conversation_id)
            yield _sse(
                {"type": "session_expired", "expired_conversation_id": str(expired_conversation_id)}
            )
            return

        user_message = Message(
            conversation_id=conversation_id,
            role="user",
            content=body.content,
            message_type="image" if body.image_url else "text",
            message_metadata={"image_url": body.image_url} if body.image_url else None,
        )
        db.add(user_message)
        await db.commit()

        baby, profile_items, summaries = await _prompt_context(db, user)
        system_prompt = build_system_prompt(user, baby, profile_items, summaries)
        response_text = ""
        try:
            graph = await get_agent_graph()
            input_state = {
                "messages": [
                    SystemMessage(content=system_prompt),
                    _human_message(body.content, conversation_id, body.image_url),
                ],
                "user_id": str(user.id),
                "user_role": user.role,
                "user_name": user.display_name,
                "conversation_id": str(conversation_id),
            }
            config = {
                "configurable": {
                    "thread_id": str(conversation_id),
                    "user_id": str(user.id),
                    "conversation_id": str(conversation_id),
                    "user_role": user.role,
                }
            }
            async for event in graph.astream_events(input_state, config=config, version="v2"):
                kind = event.get("event")
                if kind == "on_chat_model_stream":
                    chunk = event.get("data", {}).get("chunk")
                    token = getattr(chunk, "content", "")
                    if isinstance(token, str) and token:
                        response_text += token
                        yield _sse({"type": "token", "content": token})
                elif kind == "on_tool_start":
                    yield _sse(
                        {
                            "type": "tool_call",
                            "name": event.get("name"),
                            "args": event.get("data", {}).get("input", {}),
                        }
                    )
                elif kind == "on_tool_end":
                    yield _sse(
                        {
                            "type": "tool_result",
                            "name": event.get("name"),
                            "result": event.get("data", {}).get("output", ""),
                        }
                    )
        except Exception as exc:
            yield _sse({"type": "error", "message": str(exc)})
            return

        assistant_message = Message(
            conversation_id=conversation_id,
            role="assistant",
            content=response_text,
            message_type=_message_type_for(response_text),
            message_metadata=None,
        )
        db.add(assistant_message)
        await db.commit()
        await db.refresh(assistant_message)
        yield _sse(
            {
                "type": "done",
                "message_id": str(assistant_message.id),
                "message_type": assistant_message.message_type,
            }
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/conversations/{conversation_id}/images", response_model=ChatImageResponse)
async def upload_chat_image(
    conversation_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatImageResponse:
    await _get_user_conversation(db, user, conversation_id)
    suffix = Path(file.filename or "image.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4()}{suffix}"
    storage_key = _chat_image_key(conversation_id, filename)
    content = await file.read()
    mime_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    put_bytes(storage_key, content, mime_type)
    return ChatImageResponse(
        image_url=f"/api/chat/conversations/{conversation_id}/images/{filename}",
        mime_type=mime_type,
    )


@router.get("/conversations/{conversation_id}/images/{filename}")
async def get_chat_image(
    conversation_id: uuid.UUID,
    filename: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await _get_user_conversation(db, user, conversation_id)
    content = get_bytes(_chat_image_key(conversation_id, filename))
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return Response(content=content, media_type=media_type)
