from __future__ import annotations

import base64
import asyncio
import json
import logging
import mimetypes
import uuid
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.agent.context import ShortTermContext, build_short_term_context
from fawn.agent.answer_contract import enforce_answer_contract
from fawn.agent.graph import get_agent_graph
from fawn.agent.prompts import build_system_prompt
from fawn.agent.tracker_orchestrator import route_tracker_message
from fawn.api.schemas import (
    ChatImageResponse,
    ChatHistoryActivityDay,
    ChatHistoryActivityResponse,
    ChatHistoryDayTargetResponse,
    ChatHistoryTarget,
    ConversationDetail,
    ConversationRead,
    ConversationTargetWindow,
    MessageRead,
    MessageSearchResult,
    PaginatedResponse,
    SendMessageRequest,
    VoiceTranscriptionResponse,
)
from fawn.config import get_settings
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import Conversation, ConversationSummary, Message, User
from fawn.services.images import (
    ImageProcessingError,
    MODEL_IMAGE_EXTENSION,
    prepare_model_image,
)
from fawn.services.long_term_memory import LongTermMemoryService
from fawn.services.memory import get_or_create_current_conversation
from fawn.services.memory_curator import CuratorTurn, MemoryCurator
from fawn.services.storage import get_bytes, put_bytes
from fawn.services.voice_asr import DoubaoASRError, DoubaoASRService
from fawn.services.voice_tts import DoubaoTTSError, DoubaoTTSService, normalize_tts_text

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)
CHAT_HISTORY_TIMEZONE = ZoneInfo("Asia/Shanghai")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _local_day_range(day: date) -> tuple[datetime, datetime]:
    start_local = datetime.combine(day, time.min, tzinfo=CHAT_HISTORY_TIMEZONE)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _local_month_range(year: int, month: int) -> tuple[datetime, datetime]:
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)
    start_local = datetime.combine(start, time.min, tzinfo=CHAT_HISTORY_TIMEZONE)
    end_local = datetime.combine(end, time.min, tzinfo=CHAT_HISTORY_TIMEZONE)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _history_target(message: Message, conversation_started_at: datetime) -> ChatHistoryTarget:
    return ChatHistoryTarget(
        message_id=message.id,
        conversation_id=message.conversation_id,
        created_at=message.created_at,
        role=message.role,
        content=message.content,
        message_type=message.message_type,
        metadata=message.message_metadata,
        conversation_started_at=conversation_started_at,
    )


async def _get_family_conversation(
    db: AsyncSession, user: User, conversation_id: uuid.UUID
) -> Conversation:
    conversation = await db.get(Conversation, conversation_id)
    if conversation is None or conversation.family_id != user.family_id:
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
    resolution = await get_or_create_current_conversation(db, user)
    return await _conversation_read(db, resolution.conversation)


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


@router.get("/history/activity", response_model=ChatHistoryActivityResponse)
async def get_history_activity(
    year: int = Query(..., ge=1970, le=9999),
    month: int = Query(..., ge=1, le=12),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatHistoryActivityResponse:
    start_utc, end_utc = _local_month_range(year, month)
    rows = list(
        (
            await db.execute(
                select(Message.created_at)
                .join(Conversation, Conversation.id == Message.conversation_id)
                .where(
                    Conversation.family_id == user.family_id,
                    Message.created_at >= start_utc,
                    Message.created_at < end_utc,
                )
            )
        ).all()
    )
    counts: dict[date, int] = {}
    for (created_at,) in rows:
        local_date = _aware(created_at).astimezone(CHAT_HISTORY_TIMEZONE).date()
        counts[local_date] = counts.get(local_date, 0) + 1
    return ChatHistoryActivityResponse(
        year=year,
        month=month,
        days=[
            ChatHistoryActivityDay(date=day, day=day.day, message_count=counts[day])
            for day in sorted(counts)
        ],
    )


@router.get("/history/day-target", response_model=ChatHistoryDayTargetResponse)
async def get_history_day_target(
    target_date: date = Query(..., alias="date"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ChatHistoryDayTargetResponse:
    start_utc, end_utc = _local_day_range(target_date)
    row = (
        await db.execute(
            select(Message, Conversation.started_at.label("conversation_started_at"))
            .options(selectinload(Message.sender))
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                Conversation.family_id == user.family_id,
                Message.created_at >= start_utc,
                Message.created_at < end_utc,
            )
            .order_by(Message.created_at.asc(), Message.id.asc())
            .limit(1)
        )
    ).first()
    if row is None:
        return ChatHistoryDayTargetResponse(date=target_date, target=None)
    message, conversation_started_at = row
    return ChatHistoryDayTargetResponse(
        date=target_date,
        target=_history_target(message, conversation_started_at),
    )


async def _target_conversation_detail(
    *,
    conversation: Conversation,
    conversation_id: uuid.UUID,
    target_message_id: uuid.UUID,
    around_limit: int,
    db: AsyncSession,
) -> ConversationDetail:
    target_message = await db.scalar(
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.id == target_message_id, Message.conversation_id == conversation_id)
    )
    if target_message is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"target message {target_message_id} not found in conversation",
        )
    target_cursor = (target_message.created_at, target_message.id)
    before_rows = list(
        (
            await db.execute(
                select(Message)
                .options(selectinload(Message.sender))
                .where(
                    Message.conversation_id == conversation_id,
                    tuple_(Message.created_at, Message.id) < target_cursor,
                )
                .order_by(Message.created_at.desc(), Message.id.desc())
                .limit(around_limit)
            )
        ).scalars()
    )
    before_rows.reverse()
    after_rows = list(
        (
            await db.execute(
                select(Message)
                .options(selectinload(Message.sender))
                .where(
                    Message.conversation_id == conversation_id,
                    tuple_(Message.created_at, Message.id) > target_cursor,
                )
                .order_by(Message.created_at.asc(), Message.id.asc())
                .limit(around_limit)
            )
        ).scalars()
    )
    rows = before_rows + [target_message] + after_rows
    return ConversationDetail(
        conversation=await _conversation_read(db, conversation),
        messages=[MessageRead.model_validate(message) for message in rows],
        has_more=False,
        next_before=None,
        target=ConversationTargetWindow(
            target_message_id=target_message.id,
            target_index=len(before_rows),
            around_limit=around_limit,
        ),
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID,
    before: uuid.UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    target_message_id: uuid.UUID | None = Query(None),
    around_limit: int = Query(25, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConversationDetail:
    conversation = await _get_family_conversation(db, user, conversation_id)
    if target_message_id is not None:
        return await _target_conversation_detail(
            conversation=conversation,
            conversation_id=conversation_id,
            target_message_id=target_message_id,
            around_limit=around_limit,
            db=db,
        )
    cursor: tuple[Any, uuid.UUID] | None = None
    if before is not None:
        row = (
            await db.execute(
                select(Message.created_at, Message.id).where(
                    Message.id == before,
                    Message.conversation_id == conversation_id,
                )
            )
        ).first()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"cursor message {before} not found in conversation",
            )
        cursor = (row.created_at, row.id)
    q = (
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.conversation_id == conversation_id)
    )
    if cursor is not None:
        q = q.where(tuple_(Message.created_at, Message.id) < cursor)
    q = q.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1)
    rows = list((await db.execute(q)).scalars())
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
    rows.reverse()  # asc for client
    next_before = rows[0].id if (has_more and rows) else None
    return ConversationDetail(
        conversation=await _conversation_read(db, conversation),
        messages=[MessageRead.model_validate(message) for message in rows],
        has_more=has_more,
        next_before=next_before,
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
                base.order_by(Message.created_at.desc(), Message.id.desc())
                .limit(page_size)
                .offset(offset)
            )
        ).all()
    )
    items = []
    for message, conversation_started_at in rows:
        message_data = MessageRead.model_validate(message).model_dump()
        items.append(
            MessageSearchResult(
                **message_data,
                conversation_started_at=conversation_started_at,
            ).model_dump(mode="json")
        )
    return PaginatedResponse(items=items, total=total or 0, page=page, page_size=page_size)


@router.get("/search", response_model=PaginatedResponse)
async def search_messages(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse:
    return await _search_messages(q, user, db, page, page_size)


@router.get("/messages/search", response_model=PaginatedResponse)
async def search_messages_compat(
    q: str = Query(..., min_length=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedResponse:
    return await _search_messages(q, user, db, page, page_size)


async def _get_family_message(
    db: AsyncSession,
    user: User,
    message_id: uuid.UUID,
) -> Message:
    message = await db.scalar(
        select(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Message.id == message_id, Conversation.family_id == user.family_id)
    )
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    return message


async def _has_newer_assistant_message(db: AsyncSession, message: Message) -> bool:
    newer_id = await db.scalar(
        select(Message.id)
        .where(
            Message.conversation_id == message.conversation_id,
            Message.role == "assistant",
            tuple_(Message.created_at, Message.id) > (message.created_at, message.id),
        )
        .limit(1)
    )
    return newer_id is not None


@router.get("/messages/{message_id}/tts")
async def get_message_tts(
    message_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    settings = get_settings()
    if not settings.doubao_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="语音服务未配置",
        )

    message = await _get_family_message(db, user, message_id)
    if message.role != "assistant":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="只能播放管家回复",
        )
    if message.message_type not in {"text", "safety_alert"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该消息类型暂不支持语音播放",
        )
    normalized_text = normalize_tts_text(message.content)
    if not normalized_text:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="没有可播放的文字内容",
        )
    if await _has_newer_assistant_message(db, message):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="只能播放最新的管家回复",
        )

    service = DoubaoTTSService(
        api_key=settings.doubao_api_key,
        timeout_s=settings.doubao_tts_timeout_seconds,
        resource_id=settings.doubao_tts_resource_id,
        speaker=settings.doubao_tts_speaker,
        audio_format=settings.doubao_tts_audio_format,
        sample_rate=settings.doubao_tts_sample_rate,
    )
    try:
        result = await service.synthesize(normalized_text, uid=str(user.id))
    except DoubaoTTSError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    except Exception as exc:
        logger.warning("Message TTS failed for message %s", message_id, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="语音合成失败，请稍后重试",
        ) from exc
    return Response(content=result.audio, media_type=result.media_type)


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
    conversation = await _get_family_conversation(db, user, conversation_id)
    if not conversation.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conversation is not active",
        )
    resolution = await get_or_create_current_conversation(db, user)
    if resolution.conversation.id != conversation_id:
        if resolution.expired_conversation_id == conversation_id:
            async def expired_stream():
                yield _sse(
                    {
                        "type": "session_expired",
                        "expired_conversation_id": str(conversation_id),
                    }
                )

            return StreamingResponse(expired_stream(), media_type="text/event-stream")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conversation is not current",
        )

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
    content = await file.read()
    try:
        content, mime_type = prepare_model_image(content)
    except ImageProcessingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image") from exc
    filename = f"{uuid.uuid4()}{MODEL_IMAGE_EXTENSION}"
    storage_key = _chat_image_key(conversation_id, filename)
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


_VOICE_MAX_BYTES = 2 * 1024 * 1024  # ~60s WAV PCM 16k mono 16-bit ≈ 1.92MB
_VOICE_CHUNK_BYTES = 64 * 1024


@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_voice(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> VoiceTranscriptionResponse:
    """Push-to-talk ASR via Doubao. Returns recognized Chinese text for the
    caller to put in their chat draft (caller does NOT auto-send)."""
    settings = get_settings()
    if not settings.doubao_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="语音服务未配置",
        )

    # Streaming size guard — refuse oversize bodies before instantiating the
    # ASR service (cheap DoS pre-cut). Worker memory bound at _VOICE_MAX_BYTES.
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_VOICE_CHUNK_BYTES):
        total += len(chunk)
        if total > _VOICE_MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="录音文件过大，请缩短时长",
            )
        chunks.append(chunk)
    audio = b"".join(chunks)

    service = DoubaoASRService(api_key=settings.doubao_api_key)
    try:
        text = await service.transcribe(audio)
    except DoubaoASRError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
        ) from exc
    return VoiceTranscriptionResponse(text=text)
