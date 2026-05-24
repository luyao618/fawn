from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, DiaperRecord, FeedingRecord, GrowthRecord, HealthRecord, SleepRecord

APP_TIMEZONE = ZoneInfo("Asia/Shanghai")


@dataclass(frozen=True)
class RecentDeterministicEntry:
    record_type: str
    updated_at: datetime
    business_time: str
    details: str

    def format_line(self) -> str:
        return (
            f"- {self.record_type} | 业务时间：{self.business_time} | "
            f"写入/更新时间：{_format_datetime(self.updated_at)} | {self.details}"
        )


@dataclass(frozen=True)
class RecentDeterministicContext:
    family_id: uuid.UUID
    now: datetime
    entries: list[RecentDeterministicEntry]

    def render_for_prompt(self) -> str:
        if not self.entries:
            return ""
        lines = "\n".join(entry.format_line() for entry in self.entries)
        return (
            "<recent-deterministic-context>\n"
            f"当前家庭：{self.family_id}\n"
            f"当前时间：{_format_datetime(self.now)}\n"
            f"{lines}\n"
            "</recent-deterministic-context>"
        )


def _local(value: datetime) -> datetime:
    aware = value if value.tzinfo else value.replace(tzinfo=UTC)
    return aware.astimezone(APP_TIMEZONE)


def _format_datetime(value: datetime) -> str:
    return _local(value).strftime("%Y-%m-%d %H:%M")


def _format_date(value: date) -> str:
    return value.isoformat()


def _num(value: Decimal | int | None, suffix: str) -> str | None:
    if value is None:
        return None
    return f"{value}{suffix}"


def _compact(parts: list[str | None]) -> str:
    return "，".join(part for part in parts if part)


def _growth_entry(record: GrowthRecord) -> RecentDeterministicEntry:
    return RecentDeterministicEntry(
        record_type="生长",
        updated_at=record.updated_at,
        business_time=_format_date(record.measurement_date),
        details=_compact(
            [
                _num(record.weight_g, "g"),
                _num(record.height_cm, "cm"),
                _num(record.head_cm, "cm"),
                record.notes,
            ]
        )
        or "无详细数值",
    )


def _feeding_entry(record: FeedingRecord) -> RecentDeterministicEntry:
    label = {"breast": "母乳", "formula": "配方奶", "solid": "辅食"}.get(
        record.feed_type, record.feed_type
    )
    return RecentDeterministicEntry(
        record_type="喂养",
        updated_at=record.updated_at,
        business_time=_format_datetime(record.feed_time),
        details=_compact(
            [
                label,
                _num(record.amount_ml, "ml"),
                _num(record.duration_min, "分钟"),
                record.notes,
            ]
        ),
    )


def _diaper_entry(record: DiaperRecord) -> RecentDeterministicEntry:
    label = {"poop": "大便", "pee": "小便", "mixed": "混合"}.get(
        record.diaper_type, record.diaper_type
    )
    return RecentDeterministicEntry(
        record_type="大小便",
        updated_at=record.updated_at,
        business_time=_format_datetime(record.diaper_time),
        details=_compact([label, record.notes]),
    )


def _sleep_entry(record: SleepRecord) -> RecentDeterministicEntry:
    end = _format_datetime(record.sleep_end) if record.sleep_end else "未结束"
    return RecentDeterministicEntry(
        record_type="睡眠",
        updated_at=record.updated_at,
        business_time=f"{_format_datetime(record.sleep_start)} 至 {end}",
        details=_compact(
            [
                "夜间睡眠" if record.sleep_type == "night" else "小睡",
                f"醒来{record.night_wakings}次",
                record.notes,
            ]
        ),
    )


def _health_entry(record: HealthRecord) -> RecentDeterministicEntry:
    label = {"vaccination": "疫苗", "illness": "生病", "checkup": "体检"}.get(
        record.record_type, record.record_type
    )
    return RecentDeterministicEntry(
        record_type="健康",
        updated_at=record.updated_at,
        business_time=_format_date(record.record_date),
        details=_compact([label, record.title, record.description]),
    )


async def _fetch_records(
    db: AsyncSession,
    family_id: uuid.UUID,
    model: type,
    cutoff: datetime,
) -> list:
    result = await db.execute(
        select(model)
        .join(Baby, Baby.id == model.baby_id)
        .where(
            Baby.family_id == family_id,
            model.deleted_at.is_(None),
            model.updated_at >= cutoff,
        )
        .order_by(model.updated_at.desc())
        .limit(3)
    )
    return list(result.scalars())


async def build_recent_deterministic_context(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    now: datetime | None = None,
    hours: int = 24,
) -> RecentDeterministicContext | None:
    current = now or datetime.now(APP_TIMEZONE)
    cutoff = (current if current.tzinfo else current.replace(tzinfo=UTC)) - timedelta(hours=hours)
    growth, feeding, diaper, sleep, health = await _fetch_recent_records_by_type(
        db, family_id, cutoff
    )
    entries = (
        [_growth_entry(record) for record in growth]
        + [_feeding_entry(record) for record in feeding]
        + [_diaper_entry(record) for record in diaper]
        + [_sleep_entry(record) for record in sleep]
        + [_health_entry(record) for record in health]
    )
    entries.sort(key=lambda entry: entry.updated_at, reverse=True)
    entries = entries[:12]
    if not entries:
        return None
    return RecentDeterministicContext(family_id=family_id, now=current, entries=entries)


async def _fetch_recent_records_by_type(
    db: AsyncSession, family_id: uuid.UUID, cutoff: datetime
) -> tuple[
    list[GrowthRecord],
    list[FeedingRecord],
    list[DiaperRecord],
    list[SleepRecord],
    list[HealthRecord],
]:
    growth = await _fetch_records(db, family_id, GrowthRecord, cutoff)
    feeding = await _fetch_records(db, family_id, FeedingRecord, cutoff)
    diaper = await _fetch_records(db, family_id, DiaperRecord, cutoff)
    sleep = await _fetch_records(db, family_id, SleepRecord, cutoff)
    health = await _fetch_records(db, family_id, HealthRecord, cutoff)
    return growth, feeding, diaper, sleep, health
