from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.agent.context import ShortTermContext
from fawn.agent.intent import (
    APP_TIMEZONE,
    TrackerIntent,
    TrackerIntentSlots,
    classify_tracker_intent,
)
from fawn.models import AgentTask, Baby, User
from fawn.services import agent_tasks as task_service
from fawn.services import profile as profile_service
from fawn.services import tracker as tracker_service

TRACKER_CONFIDENCE_THRESHOLD = 0.75
CONFIRM_WORDS = {"确认", "可以", "对", "是的", "没问题", "记录吧", "记一下", "嗯"}
CANCEL_WORDS = {"算了", "取消", "先别记", "不要记", "不记了", "先不记"}
HIGH_RISK_BABY_FIELDS = {
    "gender",
    "birth_date",
    "birth_weight_g",
    "birth_height_cm",
    "birth_head_cm",
    "is_premature",
    "gestational_weeks",
}
RECENT_REFERENCE_TERMS = ("刚刚", "刚才", "上一条", "上一个", "你刚", "我刚")
CONTEXT_QUESTION_TERMS = (
    "记录了什么",
    "记了什么",
    "记录的什么",
    "说了什么",
    "讲了什么",
    "回复了什么",
    "完整告诉我",
    "上一句",
    "上上一句",
)


@dataclass
class TrackerRouteResult:
    response_text: str
    message_type: str = "text"
    tool_name: str | None = None
    tool_args: dict[str, Any] = field(default_factory=dict)
    tool_result: dict[str, Any] = field(default_factory=dict)


def _parse_date(value: str | date | None) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None or isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed is None:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=APP_TIMEZONE)


def _local_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    aware = value if value.tzinfo else value.replace(tzinfo=APP_TIMEZONE)
    return aware.astimezone(APP_TIMEZONE)


def _format_date(value: date | None) -> str:
    return value.isoformat() if value else "未知日期"


def _format_time(value: datetime | None) -> str:
    local = _local_datetime(value)
    return local.strftime("%H:%M") if local else "未知时间"


def _format_datetime(value: datetime | None) -> str:
    local = _local_datetime(value)
    return local.strftime("%Y-%m-%d %H:%M") if local else "未知时间"


def _format_time_range(start: datetime | None, end: datetime | None) -> str:
    if end is None:
        return f"{_format_time(start)} 开始"
    return f"{_format_time(start)}-{_format_time(end)}"


def _feeding_type_label(feed_type: str | None) -> str:
    return {"formula": "配方奶", "breast": "母乳", "solid": "辅食"}.get(
        feed_type or "", "喂养"
    )


def _sleep_type_label(sleep_type: str | None) -> str:
    return {"nap": "小睡", "night": "夜睡"}.get(sleep_type or "", "睡眠")


def _health_type_label(record_type: str | None) -> str:
    return {"vaccination": "疫苗", "illness": "生病", "checkup": "体检"}.get(
        record_type or "", "健康"
    )


def _slots_payload(slots: TrackerIntentSlots) -> dict[str, Any]:
    return slots.model_dump(exclude_none=True)


def _intent_payload(intent: TrackerIntent) -> dict[str, Any]:
    return {
        "intent": intent.intent,
        "slots": _slots_payload(intent.slots),
        "missing_slots": list(intent.missing_slots),
        "needs_confirmation": intent.needs_confirmation,
    }


def _intent_from_payload(payload: dict[str, Any]) -> TrackerIntent:
    return TrackerIntent(
        intent=payload["intent"],
        confidence=1,
        slots=TrackerIntentSlots.model_validate(payload.get("slots") or {}),
        missing_slots=list(payload.get("missing_slots") or []),
        needs_confirmation=bool(payload.get("needs_confirmation", False)),
    )


def _permission_response() -> str:
    return (
        "当前账号只有查看权限，不能记录、修改或删除数据。"
        "请使用父母或家人账号操作。"
    )


def _baby_profile_permission_response() -> str:
    return "宝宝档案只能由父母账号修改。"


def _normalize_short_reply(value: str) -> str:
    return (
        value.strip()
        .replace("。", "")
        .replace("！", "")
        .replace("!", "")
        .replace(".", "")
        .replace(" ", "")
    )


def _normalize_message(value: str) -> str:
    return (
        value.strip()
        .replace("。", "")
        .replace("？", "")
        .replace("?", "")
        .replace("！", "")
        .replace("!", "")
        .replace("，", "")
        .replace(",", "")
        .replace(" ", "")
    )


def _looks_like_context_question(value: str) -> bool:
    normalized = _normalize_message(value)
    has_recent_reference = any(term in normalized for term in RECENT_REFERENCE_TERMS)
    has_context_question = any(term in normalized for term in CONTEXT_QUESTION_TERMS)
    asks_recent_record = has_recent_reference and "记录" in normalized and "什么" in normalized
    return has_context_question or asks_recent_record


def _looks_like_recent_record_question(value: str) -> bool:
    normalized = _normalize_message(value)
    if any(term in normalized for term in ("记录了什么", "记了什么", "记录的什么")):
        return True
    return any(term in normalized for term in RECENT_REFERENCE_TERMS) and "记录" in normalized


def _is_confirm_message(value: str) -> bool:
    normalized = _normalize_short_reply(value)
    return len(normalized) <= 8 and normalized in CONFIRM_WORDS


def _is_cancel_message(value: str) -> bool:
    normalized = _normalize_short_reply(value)
    return any(word in normalized for word in CANCEL_WORDS)


def _is_write_intent(intent_name: str) -> bool:
    return (
        intent_name.startswith("record_")
        or intent_name in {"update_tracker_record", "delete_tracker_record", "update_baby_profile"}
    )


def _is_write_task(task: AgentTask) -> bool:
    return task.task_type in {
        "tracker_create",
        "tracker_update",
        "tracker_delete",
        "baby_profile_update",
    }


def _slot_has_value(slots: TrackerIntentSlots, field_name: str) -> bool:
    value = getattr(slots, field_name, None)
    return value is not None and value != ""


def _filter_missing_slots(slots: TrackerIntentSlots, missing_slots: list[str]) -> list[str]:
    seen: set[str] = set()
    remaining: list[str] = []
    for field_name in missing_slots:
        if field_name in seen:
            continue
        seen.add(field_name)
        if not _slot_has_value(slots, field_name):
            remaining.append(field_name)
    return remaining


def _first_missing_question(intent: TrackerIntent) -> str:
    if intent.user_facing_question:
        return intent.user_facing_question
    if not intent.missing_slots:
        return "这条记录还缺少关键信息，请再补充一下。"
    field = intent.missing_slots[0]
    questions = {
        "measurement_date": "这条生长记录是哪一天测量的？",
        "weight_g": "这条生长记录需要记录体重、身高或头围中的哪一项？",
        "feed_time": "这条喂养记录是什么时间？",
        "feed_type": "这条喂养记录是配方奶还是母乳？",
        "amount_ml": "这次配方奶喝了多少 ml？",
        "duration_min": "这次母乳喂了多少分钟？",
        "sleep_start": "这次睡眠是什么时候开始的？",
        "sleep_type": "这次睡眠是小睡还是夜睡？",
        "record_date": "这条健康记录是哪一天发生的？",
        "health_type": "这条健康记录是疫苗、生病还是体检？",
        "title": "这条健康记录的标题是什么？",
        "tracker_type": "你想操作哪一类记录：生长、喂养、睡眠还是健康？",
    }
    return questions.get(field, "这条记录还缺少关键信息，请再补充一下。")


def _validate_create_intent(intent: TrackerIntent) -> str | None:
    slots = intent.slots
    match intent.intent:
        case "record_growth":
            if not slots.measurement_date:
                return "这条生长记录是哪一天测量的？"
            if slots.weight_g is None and slots.height_cm is None and slots.head_cm is None:
                return "这条生长记录需要记录体重、身高或头围中的哪一项？"
        case "record_feeding":
            if not slots.feed_time:
                return "这条喂养记录是什么时间？"
            if not slots.feed_type:
                return "这条喂养记录是配方奶还是母乳？"
            if slots.feed_type == "formula" and slots.amount_ml is None:
                return "这次配方奶喝了多少 ml？"
            if slots.feed_type == "breast" and slots.duration_min is None:
                return "这次母乳喂了多少分钟？"
        case "record_sleep":
            if not slots.sleep_start:
                return "这次睡眠是什么时候开始的？"
            if not slots.sleep_type:
                return "这次睡眠是小睡还是夜睡？"
        case "record_health":
            if not slots.record_date:
                return "这条健康记录是哪一天发生的？"
            if not slots.health_type:
                return "这条健康记录是疫苗、生病还是体检？"
            if not slots.title:
                return "这条健康记录的标题是什么？"
    return None


def _baby_profile_updates(slots: TrackerIntentSlots) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if slots.baby_name:
        updates["name"] = slots.baby_name
    if slots.gender:
        updates["gender"] = slots.gender
    if slots.birth_date:
        updates["birth_date"] = _parse_date(slots.birth_date)
    for field_name in (
        "birth_weight_g",
        "birth_height_cm",
        "birth_head_cm",
        "is_premature",
        "gestational_weeks",
    ):
        value = getattr(slots, field_name)
        if value is not None:
            updates[field_name] = value
    return updates


def _validate_baby_profile_intent(intent: TrackerIntent) -> str | None:
    if not _baby_profile_updates(intent.slots):
        return "你想修改宝宝档案的哪一项？"
    return None


def _task_type_for_intent(intent: TrackerIntent) -> str | None:
    if intent.intent.startswith("record_"):
        return "tracker_create"
    if intent.intent == "update_tracker_record":
        return "tracker_update"
    if intent.intent == "delete_tracker_record":
        return "tracker_delete"
    if intent.intent == "update_baby_profile":
        return "baby_profile_update"
    return None


def _sleep_crosses_day(slots: TrackerIntentSlots) -> bool:
    if not slots.sleep_start or not slots.sleep_end:
        return False
    try:
        start = _local_datetime(_parse_datetime(slots.sleep_start))
        end = _local_datetime(_parse_datetime(slots.sleep_end))
    except ValueError:
        return True
    if start is None or end is None:
        return False
    return start.date() != end.date()


def _risk_level_for_intent(intent: TrackerIntent) -> str:
    if intent.intent in {"update_tracker_record", "delete_tracker_record"}:
        return "high"
    if intent.intent == "record_health":
        return "high"
    if intent.intent == "record_sleep" and _sleep_crosses_day(intent.slots):
        return "medium"
    if intent.intent == "update_baby_profile":
        fields = set(_baby_profile_updates(intent.slots))
        return "high" if fields & HIGH_RISK_BABY_FIELDS else "low"
    if intent.needs_confirmation:
        return "medium"
    return "low"


def _requires_confirmation(intent: TrackerIntent) -> bool:
    return intent.needs_confirmation or _risk_level_for_intent(intent) != "low"


def _confirmation_question(intent: TrackerIntent, target_label: str | None = None) -> str:
    slots = intent.slots
    if intent.intent == "delete_tracker_record":
        return f"我理解你想删除{target_label or '这条记录'}，确认删除吗？"
    if intent.intent == "update_tracker_record":
        return f"我理解你想修改{target_label or '这条记录'}，确认更新吗？"
    if intent.intent == "record_sleep":
        time_range = _format_time_range(
            _parse_datetime(slots.sleep_start), _parse_datetime(slots.sleep_end)
        )
        return (
            f"我理解为记录 {time_range} "
            f"{_sleep_type_label(slots.sleep_type)}"
            f"，夜醒 {slots.night_wakings or 0} 次，确认记录吗？"
        )
    if intent.intent == "record_health":
        health_label = _health_type_label(slots.health_type)
        return (
            f"我理解为记录 {_format_date(_parse_date(slots.record_date))} "
            f"{health_label}：{slots.title or '未命名'}，确认记录吗？"
        )
    if intent.intent == "update_baby_profile":
        updates = _baby_profile_update_labels(_baby_profile_updates(slots))
        return f"我将更新宝宝档案：{updates}，确认吗？"
    return "我理解这条信息需要确认后再写入，确认吗？"


def _baby_profile_update_labels(updates: dict[str, Any]) -> str:
    labels = {
        "name": "名字",
        "gender": "性别",
        "birth_date": "出生日期",
        "birth_weight_g": "出生体重",
        "birth_height_cm": "出生身高",
        "birth_head_cm": "出生头围",
        "is_premature": "早产状态",
        "gestational_weeks": "孕周",
    }
    parts = []
    for field_name, value in updates.items():
        display = value.isoformat() if isinstance(value, date) else value
        if field_name == "gender":
            display = "男孩" if value == "male" else "女孩"
        if field_name == "is_premature":
            display = "是" if value else "否"
        parts.append(f"{labels.get(field_name, field_name)}={display}")
    return "，".join(parts) if parts else "未识别到具体字段"


async def _create_record(
    db: AsyncSession, user: User, conversation_id: uuid.UUID, intent: TrackerIntent
) -> TrackerRouteResult:
    if question := _validate_create_intent(intent):
        return TrackerRouteResult(response_text=question)

    slots = intent.slots
    try:
        match intent.intent:
            case "record_growth":
                record = await tracker_service.create_growth_record(
                    db,
                    user,
                    measurement_date=_parse_date(slots.measurement_date),
                    weight_g=slots.weight_g,
                    height_cm=slots.height_cm,
                    head_cm=slots.head_cm,
                    notes=slots.notes,
                    source_conversation_id=conversation_id,
                )
                parts = []
                if record.weight_g is not None:
                    parts.append(f"体重 {record.weight_g}g")
                if record.height_cm is not None:
                    parts.append(f"身高 {float(record.height_cm):g}cm")
                if record.head_cm is not None:
                    parts.append(f"头围 {float(record.head_cm):g}cm")
                response = (
                    f"已记录 {_format_date(record.measurement_date)} 的生长数据："
                    f"{'，'.join(parts)}。"
                )
                if any(
                    value is not None
                    for value in (
                        record.weight_percentile,
                        record.height_percentile,
                        record.head_percentile,
                    )
                ):
                    response += " 已同步计算 WHO 参考百分位。"
            case "record_feeding":
                record = await tracker_service.create_feeding_record(
                    db,
                    user,
                    feed_time=_parse_datetime(slots.feed_time),
                    feed_type=slots.feed_type,
                    amount_ml=slots.amount_ml,
                    duration_min=slots.duration_min,
                    notes=slots.notes,
                    source_conversation_id=conversation_id,
                )
                detail = ""
                if record.feed_type == "formula" and record.amount_ml is not None:
                    detail = f" {record.amount_ml}ml"
                elif record.feed_type == "breast" and record.duration_min is not None:
                    detail = f" {record.duration_min}分钟"
                elif record.feed_type == "solid":
                    detail = (
                        "。通常 6 个月左右再开始添加辅食，"
                        "具体以儿科医生建议为准"
                    )
                response = (
                    f"已记录 {_format_time(record.feed_time)} "
                    f"{_feeding_type_label(record.feed_type)}{detail}。"
                )
            case "record_sleep":
                record = await tracker_service.create_sleep_record(
                    db,
                    user,
                    sleep_start=_parse_datetime(slots.sleep_start),
                    sleep_end=_parse_datetime(slots.sleep_end),
                    sleep_type=slots.sleep_type,
                    night_wakings=slots.night_wakings or 0,
                    notes=slots.notes,
                    source_conversation_id=conversation_id,
                )
                response = (
                    f"已记录 {_format_time_range(record.sleep_start, record.sleep_end)} "
                    f"{_sleep_type_label(record.sleep_type)}。"
                )
                if record.sleep_end is None:
                    response += " 结束时间为空。"
            case "record_health":
                record = await tracker_service.create_health_record(
                    db,
                    user,
                    record_date=_parse_date(slots.record_date),
                    record_type=slots.health_type,
                    title=slots.title or "",
                    description=slots.description,
                    source_conversation_id=conversation_id,
                )
                response = (
                    f"已记录 {_format_date(record.record_date)} "
                    f"{_health_type_label(record.record_type)}：{record.title}。"
                )
            case _:
                return TrackerRouteResult(response_text="我还不能记录这类信息。")
    except tracker_service.PermissionDenied:
        return TrackerRouteResult(response_text=_permission_response())

    return TrackerRouteResult(
        response_text=response,
        tool_name=intent.intent,
        tool_args=_slots_payload(slots),
        tool_result={"record_id": str(record.id)},
    )


async def _update_baby_profile(
    db: AsyncSession, user: User, intent: TrackerIntent
) -> TrackerRouteResult:
    if user.access_type != "parent":
        return TrackerRouteResult(response_text=_baby_profile_permission_response())
    if question := _validate_baby_profile_intent(intent):
        return TrackerRouteResult(response_text=question)

    updates = _baby_profile_updates(intent.slots)
    try:
        baby = await profile_service.update_baby(db, user.family_id, updates)
    except profile_service.NotFound:
        return TrackerRouteResult(response_text="还没有宝宝档案。")
    except profile_service.MemorySyncError:
        return TrackerRouteResult(response_text="宝宝档案同步到长期记忆失败，已保留原数据，请稍后重试。")

    response = f"已更新宝宝档案：{_baby_profile_update_labels(updates)}。"
    return TrackerRouteResult(
        response_text=response,
        tool_name="update_baby_profile",
        tool_args={key: str(value) for key, value in updates.items()},
        tool_result={"baby_id": str(baby.id), "updated": True},
    )


def _payload_with_intent(intent: TrackerIntent) -> dict[str, Any]:
    return _intent_payload(intent)


async def _create_pending_task(
    db: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    intent: TrackerIntent,
    *,
    status: str,
    missing_slots: list[str] | None = None,
    target_label: str | None = None,
) -> AgentTask | None:
    task_type = _task_type_for_intent(intent)
    if task_type is None:
        return None
    payload = _payload_with_intent(intent)
    if target_label:
        payload["target_label"] = target_label
    return await task_service.create_task(
        db,
        user,
        conversation_id=conversation_id,
        task_type=task_type,
        status=status,
        payload=payload,
        missing_slots=missing_slots or intent.missing_slots,
        risk_level=_risk_level_for_intent(intent),
    )


def _merge_task_intent(task: AgentTask, new_intent: TrackerIntent) -> TrackerIntent:
    active = _intent_from_payload(task.payload)
    active_slots = _slots_payload(active.slots)
    new_slots = _slots_payload(new_intent.slots)
    merged_slots = {**active_slots, **new_slots}

    intent_name = active.intent
    if new_intent.intent != "unknown":
        if task.task_type == "baby_profile_update" and new_intent.intent == "update_baby_profile":
            intent_name = new_intent.intent
        elif task.task_type.startswith("tracker") and (
            new_intent.intent == active.intent
            or (
                active.intent.startswith("record_")
                and new_intent.intent.startswith("record_")
                and new_intent.intent == active.intent
            )
        ):
            intent_name = new_intent.intent

    missing = list(task.missing_slots or []) + list(new_intent.missing_slots)
    return TrackerIntent(
        intent=intent_name,
        confidence=max(active.confidence, new_intent.confidence),
        slots=TrackerIntentSlots.model_validate(merged_slots),
        missing_slots=_filter_missing_slots(
            TrackerIntentSlots.model_validate(merged_slots), missing
        ),
        needs_confirmation=active.needs_confirmation or new_intent.needs_confirmation,
    )


async def _save_task_progress(
    db: AsyncSession,
    user: User,
    task: AgentTask,
    intent: TrackerIntent,
    *,
    status: str,
    missing_slots: list[str] | None = None,
) -> AgentTask:
    payload = _payload_with_intent(intent)
    if target_label := task.payload.get("target_label"):
        payload["target_label"] = target_label
    return await task_service.update_task(
        db,
        task,
        user,
        status=status,
        payload=payload,
        missing_slots=missing_slots if missing_slots is not None else intent.missing_slots,
        risk_level=_risk_level_for_intent(intent),
    )


def _query_window(slots: TrackerIntentSlots, default_days: int | None = None) -> tuple[
    date | None, date | None, date | None
]:
    query_date = _parse_date(slots.query_date)
    if query_date:
        return query_date, None, None
    from_date = _parse_date(slots.from_date)
    to_date = _parse_date(slots.to_date)
    if from_date or to_date:
        return None, from_date, to_date
    if slots.query_days or default_days:
        days = slots.query_days or default_days or 1
        today = datetime.now(APP_TIMEZONE).date()
        return None, today - timedelta(days=days - 1), today
    return None, None, None


def _period_label(date_value: date | None, from_date: date | None, to_date: date | None) -> str:
    if date_value:
        return date_value.isoformat()
    if from_date and to_date:
        return f"{from_date.isoformat()} 到 {to_date.isoformat()}"
    if from_date:
        return f"{from_date.isoformat()} 之后"
    if to_date:
        return f"{to_date.isoformat()} 之前"
    return "这段时间"


async def _query_record(
    db: AsyncSession, user: User, intent: TrackerIntent
) -> TrackerRouteResult:
    slots = intent.slots
    match intent.intent:
        case "query_growth":
            date_value, from_date, to_date = _query_window(slots, default_days=90)
            records = await tracker_service.query_growth(
                db,
                family_id=user.family_id,
                date_value=date_value,
                from_date=from_date,
                to_date=to_date,
                limit=slots.limit or 100,
            )
            if not records:
                response = (
                    f"{_period_label(date_value, from_date, to_date)}还没有生长记录。"
                )
            else:
                latest = records[0]
                metrics = []
                if latest.weight_g is not None:
                    metrics.append(f"体重 {latest.weight_g}g")
                if latest.height_cm is not None:
                    metrics.append(f"身高 {float(latest.height_cm):g}cm")
                if latest.head_cm is not None:
                    metrics.append(f"头围 {float(latest.head_cm):g}cm")
                response = (
                    f"{_period_label(date_value, from_date, to_date)}共有 "
                    f"{len(records)} 条生长记录。"
                    f"最新是 {_format_date(latest.measurement_date)}：{'，'.join(metrics)}。"
                )
        case "query_feeding":
            date_value, from_date, to_date = _query_window(slots)
            if date_value is None and from_date is None and to_date is None:
                date_value = datetime.now(APP_TIMEZONE).date()
            records = await tracker_service.query_feeding(
                db,
                family_id=user.family_id,
                date_value=date_value,
                from_date=from_date,
                to_date=to_date,
                limit=slots.limit or 500,
            )
            milk_records = [record for record in records if record.feed_type != "solid"]
            if not milk_records:
                response = (
                    f"{_period_label(date_value, from_date, to_date)}还没有喂养记录。"
                )
            else:
                total_ml = sum(
                    record.amount_ml or 0
                    for record in milk_records
                    if record.feed_type == "formula"
                )
                breast_min = sum(
                    record.duration_min or 0
                    for record in milk_records
                    if record.feed_type == "breast"
                )
                response = (
                    f"{_period_label(date_value, from_date, to_date)}共有 "
                    f"{len(milk_records)} 次喂养。"
                    f"配方奶合计 {total_ml}ml，母乳合计 {breast_min}分钟。"
                )
        case "query_sleep":
            date_value, from_date, to_date = _query_window(slots)
            if date_value is None and from_date is None and to_date is None:
                date_value = datetime.now(APP_TIMEZONE).date()
            records = await tracker_service.query_sleep(
                db,
                family_id=user.family_id,
                date_value=date_value,
                from_date=from_date,
                to_date=to_date,
                limit=slots.limit or 500,
            )
            completed = [record for record in records if record.sleep_end is not None]
            if not records:
                response = (
                    f"{_period_label(date_value, from_date, to_date)}还没有睡眠记录。"
                )
            elif not completed:
                response = (
                    f"{_period_label(date_value, from_date, to_date)}有 "
                    f"{len(records)} 条睡眠记录，"
                    "但还没有可计算总时长的完整记录。"
                )
            else:
                total_hours = sum(
                    (record.sleep_end - record.sleep_start).total_seconds() / 3600
                    for record in completed
                    if record.sleep_end is not None
                )
                night_wakings = sum(
                    record.night_wakings for record in records if record.sleep_type == "night"
                )
                response = (
                    f"{_period_label(date_value, from_date, to_date)}共有 "
                    f"{len(records)} 条睡眠记录，"
                    f"可计算睡眠约 {round(total_hours, 2)} 小时，"
                    f"夜醒 {night_wakings} 次。"
                )
        case "query_health":
            date_value, from_date, to_date = _query_window(slots)
            records = await tracker_service.query_health(
                db,
                family_id=user.family_id,
                date_value=date_value,
                from_date=from_date,
                to_date=to_date,
                limit=slots.limit or 20,
            )
            if slots.health_type:
                records = [record for record in records if record.record_type == slots.health_type]
            if not records:
                response = (
                    f"{_period_label(date_value, from_date, to_date)}还没有健康记录。"
                )
            else:
                latest = records[0]
                response = (
                    f"{_period_label(date_value, from_date, to_date)}共有 "
                    f"{len(records)} 条健康记录。"
                    f"最新是 {_format_date(latest.record_date)} "
                    f"{_health_type_label(latest.record_type)}：{latest.title}。"
                )
        case "query_baby_profile":
            try:
                baby = await tracker_service.get_default_baby(db, user.family_id)
            except tracker_service.NotFound:
                response = "还没有宝宝档案。"
            else:
                today = datetime.now(APP_TIMEZONE).date()
                age_days = (today - baby.birth_date).days
                response = (
                    f"{baby.name}，{'男孩' if baby.gender == 'male' else '女孩'}，"
                    f"出生日期 {baby.birth_date.isoformat()}，现在 {age_days} 天。"
                )
        case _:
            response = "我还不能查询这类记录。"

    return TrackerRouteResult(
        response_text=response,
        tool_name=intent.intent,
        tool_args=_slots_payload(slots),
        tool_result={"handled": True},
    )


def _candidate_label(record_type: str, record: Any) -> str:
    if record_type == "growth":
        metrics = []
        if record.weight_g is not None:
            metrics.append(f"{record.weight_g}g")
        if record.height_cm is not None:
            metrics.append(f"{float(record.height_cm):g}cm")
        if record.head_cm is not None:
            metrics.append(f"头围 {float(record.head_cm):g}cm")
        return f"生长 {_format_date(record.measurement_date)} {'/'.join(metrics)}"
    if record_type == "feeding":
        detail = f"{record.amount_ml}ml" if record.amount_ml is not None else ""
        if record.duration_min is not None:
            detail = f"{record.duration_min}分钟"
        return (
            f"喂养 {_format_time(record.feed_time)} "
            f"{_feeding_type_label(record.feed_type)} {detail}"
        ).strip()
    if record_type == "sleep":
        return (
            f"睡眠 {_format_time_range(record.sleep_start, record.sleep_end)} "
            f"{_sleep_type_label(record.sleep_type)}"
        )
    if record_type == "health":
        return (
            f"健康 {_format_date(record.record_date)} "
            f"{_health_type_label(record.record_type)} {record.title}"
        )
    return str(record.id)


async def _record_belongs_to_family(db: AsyncSession, record: Any, family_id: uuid.UUID) -> bool:
    baby = await db.get(Baby, record.baby_id)
    return baby is not None and baby.family_id == family_id


async def _find_by_id(
    db: AsyncSession, family_id: uuid.UUID, record_id: str
) -> tuple[str, Any] | None:
    record_uuid = uuid.UUID(record_id)
    for record_type, model in tracker_service.RECORD_MODELS.items():
        record = await db.get(model, record_uuid)
        if (
            record is not None
            and getattr(record, "deleted_at", None) is None
            and await _record_belongs_to_family(db, record, family_id)
        ):
            return record_type, record
    return None


async def _find_latest_in_conversation(
    db: AsyncSession,
    family_id: uuid.UUID,
    conversation_id: uuid.UUID,
    tracker_type: str | None,
) -> tuple[str, Any] | None:
    matches: list[tuple[str, Any]] = []
    models = (
        {tracker_type: tracker_service.RECORD_MODELS[tracker_type]}
        if tracker_type in tracker_service.RECORD_MODELS
        else tracker_service.RECORD_MODELS
    )
    for record_type, model in models.items():
        rows = list(
            (
                await db.execute(
                    select(model)
                    .where(
                        model.source_conversation_id == conversation_id,
                        model.deleted_at.is_(None),
                    )
                    .order_by(model.created_at.desc())
                    .limit(3)
                )
            ).scalars()
        )
        for row in rows:
            if await _record_belongs_to_family(db, row, family_id):
                matches.append((record_type, row))
    if not matches:
        return None
    return sorted(matches, key=lambda item: item[1].created_at, reverse=True)[0]


async def _recorded_by_name(db: AsyncSession, record: Any) -> str:
    user = await db.get(User, record.recorded_by)
    return user.display_name if user is not None else "未知用户"


async def _format_full_record(db: AsyncSession, record_type: str, record: Any) -> str:
    recorded_by = await _recorded_by_name(db, record)
    if record_type == "growth":
        parts = []
        if record.weight_g is not None:
            parts.append(f"体重 {record.weight_g}g")
        if record.height_cm is not None:
            parts.append(f"身高 {float(record.height_cm):g}cm")
        if record.head_cm is not None:
            parts.append(f"头围 {float(record.head_cm):g}cm")
        if record.notes:
            parts.append(f"备注：{record.notes}")
        detail = "，".join(parts) if parts else "没有具体数值"
        return (
            f"刚刚记录的是生长：日期 {_format_date(record.measurement_date)}，"
            f"{detail}，记录人 {recorded_by}。"
        )
    if record_type == "feeding":
        parts = [
            f"时间 {_format_datetime(record.feed_time)}",
            f"类型 {_feeding_type_label(record.feed_type)}",
        ]
        if record.amount_ml is not None:
            parts.append(f"量 {record.amount_ml}ml")
        if record.duration_min is not None:
            parts.append(f"时长 {record.duration_min}分钟")
        if record.notes:
            parts.append(f"备注：{record.notes}")
        parts.append(f"记录人 {recorded_by}")
        return "刚刚记录的是喂养：" + "，".join(parts) + "。"
    if record_type == "sleep":
        parts = [
            f"开始 {_format_datetime(record.sleep_start)}",
            f"结束 {_format_datetime(record.sleep_end)}"
            if record.sleep_end is not None
            else "结束时间未填写",
            f"类型 {_sleep_type_label(record.sleep_type)}",
            f"夜醒 {record.night_wakings} 次",
        ]
        if record.notes:
            parts.append(f"备注：{record.notes}")
        parts.append(f"记录人 {recorded_by}")
        return "刚刚记录的是睡眠：" + "，".join(parts) + "。"
    if record_type == "health":
        parts = [
            f"日期 {_format_date(record.record_date)}",
            f"类型 {_health_type_label(record.record_type)}",
            f"标题 {record.title}",
        ]
        if record.description:
            parts.append(f"描述：{record.description}")
        parts.append(f"记录人 {recorded_by}")
        return "刚刚记录的是健康：" + "，".join(parts) + "。"
    return f"刚刚记录的是{record_type}，记录人 {recorded_by}。"


async def _answer_context_question(
    db: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    message: str,
) -> TrackerRouteResult | None:
    if not _looks_like_recent_record_question(message):
        return None

    latest = await _find_latest_in_conversation(db, user.family_id, conversation_id, None)
    if latest is None:
        return None

    record_type, record = latest
    return TrackerRouteResult(response_text=await _format_full_record(db, record_type, record))


async def _find_by_filters(
    db: AsyncSession, user: User, slots: TrackerIntentSlots
) -> tuple[str, Any] | list[tuple[str, Any]] | None:
    if not slots.tracker_type:
        return None
    date_value, from_date, to_date = _query_window(slots)
    if date_value is None and from_date is None and to_date is None:
        date_value = _parse_date(slots.query_date)
    records = await tracker_service.query_records(
        db,
        slots.tracker_type,
        family_id=user.family_id,
        date_value=date_value,
        from_date=from_date,
        to_date=to_date,
        limit=10,
    )
    typed = [(slots.tracker_type, record) for record in records]
    if len(typed) == 1:
        return typed[0]
    if len(typed) > 1:
        return typed
    return None


async def _resolve_target(
    db: AsyncSession, user: User, conversation_id: uuid.UUID, slots: TrackerIntentSlots
) -> tuple[str, Any] | list[tuple[str, Any]] | None:
    if slots.record_id:
        return await _find_by_id(db, user.family_id, slots.record_id)
    if slots.latest_in_conversation:
        latest = await _find_latest_in_conversation(
            db, user.family_id, conversation_id, slots.tracker_type
        )
        if latest is not None:
            return latest
    return await _find_by_filters(db, user, slots)


def _update_payload(record_type: str, slots: TrackerIntentSlots) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if record_type == "growth":
        if slots.measurement_date:
            updates["measurement_date"] = _parse_date(slots.measurement_date)
        for field_name in ("weight_g", "height_cm", "head_cm", "notes"):
            value = getattr(slots, field_name)
            if value is not None:
                updates[field_name] = value
    elif record_type == "feeding":
        if slots.feed_time:
            updates["feed_time"] = _parse_datetime(slots.feed_time)
        for field_name in ("feed_type", "amount_ml", "duration_min", "notes"):
            value = getattr(slots, field_name)
            if value is not None:
                updates[field_name] = value
    elif record_type == "sleep":
        if slots.sleep_start:
            updates["sleep_start"] = _parse_datetime(slots.sleep_start)
        if slots.sleep_end:
            updates["sleep_end"] = _parse_datetime(slots.sleep_end)
        for field_name in ("sleep_type", "night_wakings", "notes"):
            value = getattr(slots, field_name)
            if value is not None:
                updates[field_name] = value
        if updates.get("sleep_type") == "nap":
            updates["night_wakings"] = 0
    elif record_type == "health":
        if slots.record_date:
            updates["record_date"] = _parse_date(slots.record_date)
        if slots.health_type:
            updates["record_type"] = slots.health_type
        for field_name in ("title", "description"):
            value = getattr(slots, field_name)
            if value is not None:
                updates[field_name] = value
    return updates


def _ambiguous_response(candidates: list[tuple[str, Any]]) -> str:
    labels = [_candidate_label(record_type, record) for record_type, record in candidates[:5]]
    return (
        "我找到了多条可能的记录，请再说明要操作哪一条："
        + "；".join(labels)
    )


def _intent_with_target(intent: TrackerIntent, record_type: str, record: Any) -> TrackerIntent:
    slots = intent.slots.model_copy(
        update={"tracker_type": record_type, "record_id": str(record.id)}
    )
    return intent.model_copy(update={"slots": slots})


async def _prepare_mutation_confirmation(
    db: AsyncSession, user: User, conversation_id: uuid.UUID, intent: TrackerIntent
) -> TrackerRouteResult:
    target = await _resolve_target(db, user, conversation_id, intent.slots)
    if target is None:
        return TrackerRouteResult(
            response_text="我没找到对应的记录，请再说明要操作哪一条。"
        )
    if isinstance(target, list):
        return TrackerRouteResult(response_text=_ambiguous_response(target))

    record_type, record = target
    intent = _intent_with_target(intent, record_type, record)
    target_label = _candidate_label(record_type, record)
    await _create_pending_task(
        db,
        user,
        conversation_id,
        intent,
        status="awaiting_confirmation",
        target_label=target_label,
    )
    return TrackerRouteResult(response_text=_confirmation_question(intent, target_label))


async def _mutate_record(
    db: AsyncSession, user: User, conversation_id: uuid.UUID, intent: TrackerIntent
) -> TrackerRouteResult:
    slots = intent.slots
    target = await _resolve_target(db, user, conversation_id, slots)
    if target is None:
        return TrackerRouteResult(
            response_text="我没找到对应的记录，请再说明要操作哪一条。"
        )
    if isinstance(target, list):
        return TrackerRouteResult(response_text=_ambiguous_response(target))

    record_type, record = target
    try:
        if intent.intent == "delete_tracker_record":
            await tracker_service.delete_tracker_record(db, user, record_type, record.id)
            return TrackerRouteResult(
                response_text=f"已删除这条{_candidate_label(record_type, record)}记录。",
                tool_name="delete_tracker_record",
                tool_args=_slots_payload(slots),
                tool_result={"record_id": str(record.id), "deleted": True},
            )

        updates = _update_payload(record_type, slots)
        if not updates:
            return TrackerRouteResult(response_text="你想修改这条记录的哪一项？")
        updated = await tracker_service.update_tracker_record(
            db, user, record_type, record.id, updates
        )
        return TrackerRouteResult(
            response_text=f"已更新这条{_candidate_label(record_type, updated)}记录。",
            tool_name="update_tracker_record",
            tool_args=_slots_payload(slots),
            tool_result={"record_id": str(updated.id), "updated": True},
        )
    except tracker_service.PermissionDenied:
        return TrackerRouteResult(response_text=_permission_response())


async def _execute_task(
    db: AsyncSession,
    user: User,
    task: AgentTask,
) -> TrackerRouteResult:
    intent = _intent_from_payload(task.payload)
    if task.task_type == "baby_profile_update":
        return await _update_baby_profile(db, user, intent)
    if task.task_type == "tracker_create":
        return await _create_record(db, user, task.conversation_id, intent)
    if task.task_type in {"tracker_update", "tracker_delete"}:
        return await _mutate_record(db, user, task.conversation_id, intent)
    return TrackerRouteResult(response_text="我还不能执行这类任务。")


def _recent_context_prompt(recent_context: ShortTermContext | None) -> str | None:
    if recent_context is None:
        return None
    return recent_context.format_for_prompt() or None


async def _classify_message(
    message: str,
    *,
    recent_context: ShortTermContext | None = None,
    active_task: AgentTask | None = None,
) -> TrackerIntent:
    try:
        return await classify_tracker_intent(
            message,
            recent_context=_recent_context_prompt(recent_context),
            active_task_payload=active_task.payload if active_task is not None else None,
        )
    except TypeError as exc:
        # Keeps existing tests and simple call sites that monkeypatch the
        # classifier with a single-argument coroutine working.
        if "unexpected keyword" not in str(exc):
            raise
        return await classify_tracker_intent(message)


def _missing_slots_for_intent(intent: TrackerIntent) -> list[str]:
    return _filter_missing_slots(intent.slots, intent.missing_slots)


def _next_question_for_intent(intent: TrackerIntent) -> str | None:
    missing = _missing_slots_for_intent(intent)
    if missing:
        return _first_missing_question(intent.model_copy(update={"missing_slots": missing}))
    if intent.intent.startswith("record_"):
        return _validate_create_intent(intent)
    if intent.intent == "update_baby_profile":
        return _validate_baby_profile_intent(intent)
    return None


async def _handle_active_task(
    db: AsyncSession,
    user: User,
    task: AgentTask,
    message: str,
    recent_context: ShortTermContext | None,
) -> TrackerRouteResult | None:
    if _is_cancel_message(message):
        await task_service.cancel_task(db, task, user)
        return TrackerRouteResult(response_text="好的，这次先不记录。")

    if user.access_type == "friend" and _is_write_task(task):
        return TrackerRouteResult(response_text=_permission_response())

    if _is_confirm_message(message):
        if task.status != "awaiting_confirmation":
            intent = _intent_from_payload(task.payload)
            return TrackerRouteResult(
                response_text=_next_question_for_intent(intent)
                or "这条任务还不能确认，请再补充一下。"
            )
        result = await _execute_task(db, user, task)
        if result.tool_name:
            await task_service.complete_task(db, task, user)
        return result

    try:
        new_intent = await _classify_message(
            message, recent_context=recent_context, active_task=task
        )
    except Exception:
        return None

    if new_intent.intent == "unknown" and new_intent.confidence < TRACKER_CONFIDENCE_THRESHOLD:
        active_intent = _intent_from_payload(task.payload)
        return TrackerRouteResult(
            response_text=_next_question_for_intent(active_intent)
            or "我还在处理上一条任务。如果要取消，可以说“先别记”。"
        )

    merged = _merge_task_intent(task, new_intent)
    if question := _next_question_for_intent(merged):
        missing = _missing_slots_for_intent(merged) or list(merged.missing_slots)
        await _save_task_progress(
            db, user, task, merged, status="pending", missing_slots=missing
        )
        return TrackerRouteResult(response_text=question)

    if _requires_confirmation(merged):
        await _save_task_progress(db, user, task, merged, status="awaiting_confirmation")
        return TrackerRouteResult(
            response_text=_confirmation_question(
                merged, task.payload.get("target_label")
            )
        )

    await _save_task_progress(db, user, task, merged, status="pending", missing_slots=[])
    result = await _execute_task(db, user, task)
    if result.tool_name:
        await task_service.complete_task(db, task, user)
    return result


async def route_tracker_message(
    db: AsyncSession,
    user: User,
    conversation_id: uuid.UUID,
    message: str,
    *,
    recent_context: ShortTermContext | None = None,
) -> TrackerRouteResult | None:
    if _looks_like_context_question(message):
        context_result = await _answer_context_question(db, user, conversation_id, message)
        return context_result

    active_task = await task_service.get_active_task(db, user.family_id)
    if active_task is not None:
        active_result = await _handle_active_task(
            db, user, active_task, message, recent_context
        )
        if active_result is not None:
            return active_result

    try:
        intent = await _classify_message(message, recent_context=recent_context)
    except Exception:
        return None

    if intent.intent == "unknown" or intent.confidence < TRACKER_CONFIDENCE_THRESHOLD:
        return None

    if intent.intent == "context_question":
        return await _answer_context_question(db, user, conversation_id, message)

    if user.access_type == "friend" and _is_write_intent(intent.intent):
        return TrackerRouteResult(response_text=_permission_response())

    if intent.intent.startswith("record_"):
        if question := _next_question_for_intent(intent):
            missing = _missing_slots_for_intent(intent) or list(intent.missing_slots)
            await _create_pending_task(
                db,
                user,
                conversation_id,
                intent,
                status="pending",
                missing_slots=missing,
            )
            return TrackerRouteResult(response_text=question)
        if _requires_confirmation(intent):
            await _create_pending_task(
                db,
                user,
                conversation_id,
                intent,
                status="awaiting_confirmation",
            )
            return TrackerRouteResult(response_text=_confirmation_question(intent))
        return await _create_record(db, user, conversation_id, intent)
    if intent.intent.startswith("query_"):
        return await _query_record(db, user, intent)
    if intent.intent == "update_baby_profile":
        if question := _next_question_for_intent(intent):
            missing = _missing_slots_for_intent(intent) or list(intent.missing_slots)
            await _create_pending_task(
                db,
                user,
                conversation_id,
                intent,
                status="pending",
                missing_slots=missing,
            )
            return TrackerRouteResult(response_text=question)
        if _requires_confirmation(intent):
            await _create_pending_task(
                db,
                user,
                conversation_id,
                intent,
                status="awaiting_confirmation",
            )
            return TrackerRouteResult(response_text=_confirmation_question(intent))
        return await _update_baby_profile(db, user, intent)
    if intent.intent in {"update_tracker_record", "delete_tracker_record"}:
        return await _prepare_mutation_confirmation(db, user, conversation_id, intent)
    return None
