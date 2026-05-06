import uuid
from datetime import UTC, date as date_cls, datetime, timedelta
from typing import Annotated, Any, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import select

from fawn.db.session import async_session_factory
from fawn.models import Baby, User
from fawn.services import tracker as tracker_service


InjectedUserId = Annotated[str, InjectedState("user_id")]
InjectedConversationId = Annotated[str, InjectedState("conversation_id")]


async def _load_user(user_id: str) -> tuple[Any, Any, User]:
    session = async_session_factory()
    db = await session.__aenter__()
    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        await session.__aexit__(None, None, None)
        raise tracker_service.NotFound("User not found")
    return session, db, user


def _parse_date(value: str | date_cls) -> date_cls:
    return value if isinstance(value, date_cls) else date_cls.fromisoformat(value)


def _parse_datetime(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _record_payload(record: Any) -> dict[str, Any]:
    return {"record_id": str(record.id)}


def _error(exc: Exception) -> str:
    if isinstance(exc, tracker_service.PermissionDenied):
        return "您当前没有记录数据的权限，请联系管理员"
    return str(exc)


def _missing_context(user_id: str, conversation_id: str | None = None) -> str | None:
    if not user_id:
        return "缺少当前用户上下文，请重新登录后再试"
    if conversation_id is not None and not conversation_id:
        return "缺少当前会话上下文，请重新开启对话后再试"
    return None


@tool
async def record_growth(
    measurement_date: str,
    weight_g: int | None = None,
    height_cm: float | None = None,
    head_cm: float | None = None,
    notes: str | None = None,
    user_id: InjectedUserId = "",
    conversation_id: InjectedConversationId = "",
) -> dict[str, Any] | str:
    """Record baby growth data and calculate WHO percentiles."""
    if error := _missing_context(user_id, conversation_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        record = await tracker_service.create_growth_record(
            db,
            user,
            measurement_date=_parse_date(measurement_date),
            weight_g=weight_g,
            height_cm=height_cm,
            head_cm=head_cm,
            notes=notes,
            source_conversation_id=uuid.UUID(conversation_id),
        )
        payload = _record_payload(record)
        payload["percentiles"] = {
            "weight_percentile": float(record.weight_percentile)
            if record.weight_percentile is not None
            else None,
            "height_percentile": float(record.height_percentile)
            if record.height_percentile is not None
            else None,
            "head_percentile": float(record.head_percentile)
            if record.head_percentile is not None
            else None,
        }
        return payload
    except Exception as exc:
        return _error(exc)
    finally:
        await session.__aexit__(None, None, None)


@tool
async def record_feeding(
    feed_time: str,
    feed_type: Literal["breast", "formula", "solid"],
    amount_ml: int | None = None,
    duration_min: int | None = None,
    notes: str | None = None,
    user_id: InjectedUserId = "",
    conversation_id: InjectedConversationId = "",
) -> dict[str, str] | str:
    """Record a feeding event."""
    if error := _missing_context(user_id, conversation_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        record = await tracker_service.create_feeding_record(
            db,
            user,
            feed_time=_parse_datetime(feed_time),
            feed_type=feed_type,
            amount_ml=amount_ml,
            duration_min=duration_min,
            notes=notes,
            source_conversation_id=uuid.UUID(conversation_id),
        )
        return _record_payload(record)
    except Exception as exc:
        return _error(exc)
    finally:
        await session.__aexit__(None, None, None)


@tool
async def record_sleep(
    sleep_start: str,
    sleep_type: Literal["nap", "night"],
    sleep_end: str | None = None,
    night_wakings: int = 0,
    notes: str | None = None,
    user_id: InjectedUserId = "",
    conversation_id: InjectedConversationId = "",
) -> dict[str, str] | str:
    """Record a sleep event."""
    if error := _missing_context(user_id, conversation_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        record = await tracker_service.create_sleep_record(
            db,
            user,
            sleep_start=_parse_datetime(sleep_start),
            sleep_end=_parse_datetime(sleep_end) if sleep_end else None,
            night_wakings=night_wakings,
            sleep_type=sleep_type,
            notes=notes,
            source_conversation_id=uuid.UUID(conversation_id),
        )
        return _record_payload(record)
    except Exception as exc:
        return _error(exc)
    finally:
        await session.__aexit__(None, None, None)


@tool
async def record_health(
    record_date: str,
    record_type: Literal["vaccination", "illness", "checkup"],
    title: str,
    description: str | None = None,
    user_id: InjectedUserId = "",
    conversation_id: InjectedConversationId = "",
) -> dict[str, str] | str:
    """Record a health event."""
    if error := _missing_context(user_id, conversation_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        record = await tracker_service.create_health_record(
            db,
            user,
            record_date=_parse_date(record_date),
            record_type=record_type,
            title=title,
            description=description,
            source_conversation_id=uuid.UUID(conversation_id),
        )
        return _record_payload(record)
    except Exception as exc:
        return _error(exc)
    finally:
        await session.__aexit__(None, None, None)


@tool
async def update_tracker_record(
    record_type: Literal["growth", "feeding", "sleep", "health"],
    record_id: str,
    updates: dict[str, Any],
    user_id: InjectedUserId = "",
) -> dict[str, Any] | str:
    """Update a tracker record by id."""
    if error := _missing_context(user_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        record = await tracker_service.update_tracker_record(
            db,
            user,
            record_type,
            uuid.UUID(record_id),
            updates,
        )
        return {"record_id": str(record.id), "updated": True}
    except Exception as exc:
        return _error(exc)
    finally:
        await session.__aexit__(None, None, None)


@tool
async def delete_tracker_record(
    record_type: Literal["growth", "feeding", "sleep", "health"],
    record_id: str,
    user_id: InjectedUserId = "",
) -> dict[str, Any] | str:
    """Delete a tracker record by id."""
    if error := _missing_context(user_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        await tracker_service.delete_tracker_record(db, user, record_type, uuid.UUID(record_id))
        return {"record_id": record_id, "deleted": True}
    except Exception as exc:
        return _error(exc)
    finally:
        await session.__aexit__(None, None, None)


@tool
async def query_growth_data(days: int = 90, user_id: InjectedUserId = "") -> dict[str, Any] | str:
    """Return recent growth records and percentile trends."""
    if error := _missing_context(user_id):
        return error
    from_date = date_cls.today() - timedelta(days=days)
    session, db, user = await _load_user(user_id)
    try:
        records = await tracker_service.query_growth(
            db, family_id=user.family_id, from_date=from_date, limit=500
        )
    finally:
        await session.__aexit__(None, None, None)
    return {
        "records": [
            {
                "id": str(record.id),
                "measurement_date": record.measurement_date.isoformat(),
                "weight_g": record.weight_g,
                "height_cm": float(record.height_cm) if record.height_cm is not None else None,
                "head_cm": float(record.head_cm) if record.head_cm is not None else None,
                "weight_percentile": float(record.weight_percentile)
                if record.weight_percentile is not None
                else None,
                "height_percentile": float(record.height_percentile)
                if record.height_percentile is not None
                else None,
                "head_percentile": float(record.head_percentile)
                if record.head_percentile is not None
                else None,
                "notes": record.notes,
            }
            for record in records
        ]
    }


@tool
async def query_feeding_data(
    date: str | None = None, user_id: InjectedUserId = ""
) -> dict[str, Any] | str:
    """Return feeding records and daily totals."""
    if error := _missing_context(user_id):
        return error
    target = _parse_date(date) if date else date_cls.today()
    session, db, user = await _load_user(user_id)
    try:
        records = await tracker_service.query_feeding(
            db, family_id=user.family_id, date_value=target, limit=500
        )
    finally:
        await session.__aexit__(None, None, None)
    milk_records = [record for record in records if record.feed_type != "solid"]
    return {
        "date": target.isoformat(),
        "total_ml": sum(
            record.amount_ml or 0 for record in milk_records if record.feed_type == "formula"
        ),
        "breast_duration_min": sum(
            record.duration_min or 0 for record in milk_records if record.feed_type == "breast"
        ),
        "count": len(milk_records),
        "records": [
            {"id": str(r.id), "feed_time": r.feed_time.isoformat(), "feed_type": r.feed_type}
            for r in milk_records
        ],
    }


@tool
async def query_sleep_data(
    date: str | None = None, user_id: InjectedUserId = ""
) -> dict[str, Any] | str:
    """Return sleep records and daily totals."""
    if error := _missing_context(user_id):
        return error
    target = _parse_date(date) if date else date_cls.today()
    session, db, user = await _load_user(user_id)
    try:
        records = await tracker_service.query_sleep(
            db, family_id=user.family_id, date_value=target, limit=500
        )
    finally:
        await session.__aexit__(None, None, None)
    total_hours = sum(
        (record.sleep_end - record.sleep_start).total_seconds() / 3600
        for record in records
        if record.sleep_end is not None
    )
    return {
        "date": target.isoformat(),
        "total_hours": round(total_hours, 2),
        "night_wakings": sum(record.night_wakings for record in records if record.sleep_type == "night"),
        "records": [
            {"id": str(r.id), "sleep_start": r.sleep_start.isoformat(), "sleep_type": r.sleep_type}
            for r in records
        ],
    }


@tool
async def query_health_timeline(
    limit: int = 20, user_id: InjectedUserId = ""
) -> dict[str, Any] | str:
    """Return recent health events."""
    if error := _missing_context(user_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        records = await tracker_service.query_health(db, family_id=user.family_id, limit=limit)
    finally:
        await session.__aexit__(None, None, None)
    return {
        "records": [
            {
                "id": str(record.id),
                "record_date": record.record_date.isoformat(),
                "record_type": record.record_type,
                "title": record.title,
                "description": record.description,
            }
            for record in records
        ]
    }


@tool
async def get_baby_profile(user_id: InjectedUserId = "") -> dict[str, Any] | str:
    """Return the baby profile."""
    if error := _missing_context(user_id):
        return error
    session, db, user = await _load_user(user_id)
    try:
        baby = await db.scalar(
            select(Baby)
            .where(Baby.family_id == user.family_id)
            .order_by(Baby.created_at.asc())
            .limit(1)
        )
        if baby is None:
            return {"baby": None}
    finally:
        await session.__aexit__(None, None, None)
    return {
        "baby": {
            "id": str(baby.id),
            "name": baby.name,
            "gender": baby.gender,
            "birth_date": baby.birth_date.isoformat() if baby.birth_date is not None else None,
            "birth_weight_g": baby.birth_weight_g,
            "is_premature": baby.is_premature,
            "gestational_weeks": baby.gestational_weeks,
        }
    }
