from __future__ import annotations

import base64
import asyncio
import json
import logging
import mimetypes
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.agent.context import ShortTermContext, build_short_term_context
from fawn.agent.answer_contract import enforce_answer_contract
from fawn.agent.graph import get_agent_graph
from fawn.agent.prompts import build_system_prompt
from fawn.agent.tracker_orchestrator import route_tracker_message
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
from fawn.models import Conversation, ConversationSummary, Message, User
from fawn.services.long_term_memory import LongTermMemoryService
from fawn.services.memory_curator import CuratorTurn, MemoryCurator
from fawn.services.storage import get_bytes, put_bytes

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


async def _get_family_conversation(
    db: AsyncSession, user: User, conversation_id: uuid.UUID
) -> Conversation:
    conversation = await db.get(Conversation, conversation_id)
    if conversation is None or conversation.family_id != user.family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


async def _get_or_create_family_conversation(db: AsyncSession, user: User) -> Conversation:
    conversation = await db.scalar(
        select(Conversation)
        .where(Conversation.family_id == user.family_id, Conversation.is_active.is_(True))
        .order_by(Conversation.started_at.asc())
        .limit(1)
    )
    if conversation is not None:
        return conversation
    conversation = Conversation(family_id=user.family_id, user_id=user.id)
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
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
    conversation = await _get_or_create_family_conversation(db, user)
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
        select(func.count()).select_from(Conversation).where(Conversation.family_id == user.family_id)
    )
    conversations = list(
        (
            await db.execute(
                select(Conversation)
                .where(Conversation.family_id == user.family_id)
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
    conversation = await _get_family_conversation(db, user, conversation_id)
    messages = list(
        (
            await db.execute(
                select(Message)
                .options(selectinload(Message.sender))
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
        .options(selectinload(Message.sender))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.family_id == user.family_id, Message.content.ilike(f"%{query}%"))
    )
    total = await db.scalar(
        select(func.count())
        .select_from(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.family_id == user.family_id, Message.content.ilike(f"%{query}%"))
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


def _chat_image_key(conversation_id: uuid.UUID, filename: str) -> str:
    return f"chat-images/{conversation_id}/{filename}"


def _url_to_storage_key(conversation_id: uuid.UUID, image_url: str) -> str:
    filename = Path(image_url).name
    return _chat_image_key(conversation_id, filename)


def _content_with_recent_context(content: str, recent_context: ShortTermContext | None) -> str:
    context_block = recent_context.format_for_prompt() if recent_context else ""
    if not context_block:
        return content
    return f"{context_block}\n\n当前用户消息：\n{content}"


def _human_message(
    content: str,
    conversation_id: uuid.UUID,
    image_url: str | None,
    recent_context: ShortTermContext | None = None,
) -> HumanMessage:
    content = _content_with_recent_context(content, recent_context)
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


async def _run_post_turn_memory_hook(turn: CuratorTurn) -> None:
    try:
        async with asyncio.timeout(get_settings().memory_curator_timeout_seconds):
            await MemoryCurator().curate_turn(turn)
    except Exception:
        logger.warning("Post-turn memory hook failed", exc_info=True)


def schedule_post_turn_memory_hook(
    *,
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    user_role: str,
    user_name: str,
    user_content: str,
    assistant_content: str,
) -> None:
    turn = CuratorTurn(
        family_id=family_id,
        user_id=user_id,
        user_role=user_role,
        user_name=user_name,
        user_content=user_content,
        assistant_content=assistant_content,
    )
    try:
        asyncio.create_task(_run_post_turn_memory_hook(turn))
    except RuntimeError:
        logger.warning("Unable to schedule post-turn memory hook", exc_info=True)


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: uuid.UUID,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    await _get_family_conversation(db, user, conversation_id)

    async def event_stream():
        user_message = Message(
            conversation_id=conversation_id,
            sender_user_id=user.id,
            role="user",
            content=body.content,
            message_type="image" if body.image_url else "text",
            message_metadata={"image_url": body.image_url} if body.image_url else None,
        )
        db.add(user_message)
        await db.commit()
        await db.refresh(user_message)

        recent_context = await build_short_term_context(
            db,
            conversation_id,
            family_id=user.family_id,
            exclude_message_id=user_message.id,
        )

        if not body.image_url:
            try:
                route_result = await route_tracker_message(
                    db,
                    user,
                    conversation_id,
                    body.content,
                    recent_context=recent_context,
                )
            except Exception:
                logger.warning(
                    "Deterministic tracker route failed for conversation %s",
                    conversation_id,
                    exc_info=True,
                )
                route_result = None
            if route_result is not None:
                if route_result.tool_name:
                    yield _sse(
                        {
                            "type": "tool_call",
                            "name": route_result.tool_name,
                            "args": route_result.tool_args,
                        }
                    )
                    yield _sse(
                        {
                            "type": "tool_result",
                            "name": route_result.tool_name,
                            "result": route_result.tool_result,
                        }
                    )
                response_text = route_result.response_text
                yield _sse({"type": "token", "content": response_text})
                assistant_message = Message(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=response_text,
                    message_type=route_result.message_type,
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
                schedule_post_turn_memory_hook(
                    family_id=user.family_id,
                    user_id=user.id,
                    user_role=user.role,
                    user_name=user.display_name,
                    user_content=body.content,
                    assistant_content=response_text,
                )
                return

        long_term_memory = await LongTermMemoryService().load_context(db, user)
        system_prompt = build_system_prompt(user, long_term_memory)
        if not get_settings().llm.tool_calling_enabled:
            system_prompt += (
                "\n\n## 当前运行模式\n"
                "- 后端当前未启用工具调用。不要声称已经写入或查询系统记录。\n"
                "- 用户提供需要记录的数据时，请用自然语言确认并提示可到对应记录页手动填写。"
            )
        response_text = ""
        knowledge_tool_outputs: list[Any] = []
        try:
            graph = await get_agent_graph()
            input_state = {
                "messages": [
                    SystemMessage(content=system_prompt),
                    _human_message(
                        body.content,
                        conversation_id,
                        body.image_url,
                        recent_context,
                    ),
                ],
                "user_id": str(user.id),
                "user_role": user.role,
                "user_access_type": user.access_type,
                "user_name": user.display_name,
                "conversation_id": str(conversation_id),
            }
            config = {
                "configurable": {
                    "thread_id": str(conversation_id),
                    "user_id": str(user.id),
                    "conversation_id": str(conversation_id),
                    "user_role": user.role,
                    "user_access_type": user.access_type,
                }
            }
            async with asyncio.timeout(get_settings().llm.request_timeout_seconds):
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
                        tool_output = event.get("data", {}).get("output", "")
                        if event.get("name") == "search_knowledge":
                            knowledge_tool_outputs.append(tool_output)
                        yield _sse(
                            {
                                "type": "tool_result",
                                "name": event.get("name"),
                                "result": tool_output,
                            }
                        )
        except TimeoutError:
            logger.warning("Chat response timed out for conversation %s", conversation_id)
            yield _sse({"type": "error", "message": "模型响应超时，请稍后重试"})
            return
        except Exception as exc:
            logger.warning("Chat response failed for conversation %s", conversation_id, exc_info=True)
            yield _sse({"type": "error", "message": str(exc) or exc.__class__.__name__})
            return

        contracted_response = enforce_answer_contract(
            response_text,
            user_query=body.content,
            knowledge_tool_outputs=knowledge_tool_outputs,
        )
        if contracted_response != response_text:
            suffix = contracted_response[len(response_text):]
            if suffix:
                response_text = contracted_response
                yield _sse({"type": "token", "content": suffix})

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
        schedule_post_turn_memory_hook(
            family_id=user.family_id,
            user_id=user.id,
            user_role=user.role,
            user_name=user.display_name,
            user_content=body.content,
            assistant_content=response_text,
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/conversations/{conversation_id}/images", response_model=ChatImageResponse)
async def upload_chat_image(
    conversation_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatImageResponse:
    await _get_family_conversation(db, user, conversation_id)
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
    await _get_family_conversation(db, user, conversation_id)
    content = get_bytes(_chat_image_key(conversation_id, filename))
    media_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return Response(content=content, media_type=media_type)
