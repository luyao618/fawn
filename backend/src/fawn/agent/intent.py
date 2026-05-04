from __future__ import annotations

import json
from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, ValidationError

from fawn.llm import create_chat_model

APP_TIMEZONE = ZoneInfo("Asia/Shanghai")

TrackerIntentName = Literal[
    "record_growth",
    "record_feeding",
    "record_sleep",
    "record_health",
    "query_growth",
    "query_feeding",
    "query_sleep",
    "query_health",
    "query_baby_profile",
    "context_question",
    "update_baby_profile",
    "update_tracker_record",
    "delete_tracker_record",
    "unknown",
]
TrackerRecordType = Literal["growth", "feeding", "sleep", "health"]
FeedingType = Literal["breast", "formula", "solid"]
SleepType = Literal["nap", "night"]
HealthType = Literal["vaccination", "illness", "checkup"]


class TrackerIntentSlots(BaseModel):
    measurement_date: str | None = None
    weight_g: int | None = None
    height_cm: float | None = None
    head_cm: float | None = None

    feed_time: str | None = None
    feed_type: FeedingType | None = None
    amount_ml: int | None = None
    duration_min: int | None = None

    sleep_start: str | None = None
    sleep_end: str | None = None
    sleep_type: SleepType | None = None
    night_wakings: int | None = None

    record_date: str | None = None
    health_type: HealthType | None = None
    title: str | None = None
    description: str | None = None
    notes: str | None = None

    tracker_type: TrackerRecordType | None = None
    record_id: str | None = None
    query_date: str | None = None
    from_date: str | None = None
    to_date: str | None = None
    query_days: int | None = Field(default=None, ge=1, le=365)
    limit: int | None = Field(default=None, ge=1, le=100)
    latest_in_conversation: bool = False

    baby_name: str | None = None
    gender: Literal["male", "female"] | None = None
    birth_date: str | None = None
    birth_weight_g: int | None = None
    birth_height_cm: float | None = None
    birth_head_cm: float | None = None
    is_premature: bool | None = None
    gestational_weeks: int | None = None


class TrackerIntent(BaseModel):
    intent: TrackerIntentName
    confidence: float = Field(ge=0, le=1)
    slots: TrackerIntentSlots = Field(default_factory=TrackerIntentSlots)
    missing_slots: list[str] = Field(default_factory=list)
    needs_confirmation: bool = False
    user_facing_question: str | None = None


TRACKER_INTENT_SYSTEM_PROMPT = """你是 Fawn 后端的 tracker 意图识别器。

你的任务只是不带解释地输出 JSON，供后端决定是否调用确定性工具。
不要回答用户，不要声称已经记录。

可选 intent：
- record_growth: 用户要记录体重/身长/头围
- record_feeding: 用户要记录喂养
- record_sleep: 用户要记录睡眠
- record_health: 用户要记录疫苗、疾病、体检等健康事件
- query_growth: 用户要查询生长记录或趋势
- query_feeding: 用户要查询喂养记录或统计
- query_sleep: 用户要查询睡眠记录或统计
- query_health: 用户要查询健康时间线
- query_baby_profile: 用户要查询宝宝档案、年龄、出生信息
- context_question: 用户在问最近对话、刚刚记录了什么、上一条消息或刚才发生了什么
- update_baby_profile: 用户要修改宝宝档案
- update_tracker_record: 用户要修改已有 tracker 记录
- delete_tracker_record: 用户要删除已有 tracker 记录
- unknown: 不属于 tracker 创建/查询/修改/删除

输出字段：
{
  "intent": "...",
  "confidence": 0.0-1.0,
  "slots": {
    "measurement_date": "YYYY-MM-DD",
    "weight_g": 4200,
    "height_cm": 54.0,
    "head_cm": 37.0,
    "feed_time": "ISO-8601 datetime with timezone",
    "feed_type": "breast|formula|solid",
    "amount_ml": 90,
    "duration_min": 12,
    "sleep_start": "ISO-8601 datetime with timezone",
    "sleep_end": "ISO-8601 datetime with timezone",
    "sleep_type": "nap|night",
    "night_wakings": 1,
    "record_date": "YYYY-MM-DD",
    "health_type": "vaccination|illness|checkup",
    "title": "简短标题",
    "description": "描述",
    "notes": "备注",
    "tracker_type": "growth|feeding|sleep|health",
    "record_id": "uuid when user provides it",
    "query_date": "YYYY-MM-DD",
    "from_date": "YYYY-MM-DD",
    "to_date": "YYYY-MM-DD",
    "query_days": 7,
    "limit": 20,
    "latest_in_conversation": false,
    "baby_name": "小名",
    "gender": "male|female",
    "birth_date": "YYYY-MM-DD",
    "birth_weight_g": 3200,
    "birth_height_cm": 50.0,
    "birth_head_cm": 34.0,
    "is_premature": false,
    "gestational_weeks": 39
  },
  "missing_slots": [],
  "needs_confirmation": false,
  "user_facing_question": null
}

规则：
- 如果用户说“今天”“刚刚”“早上”等相对时间，
  必须根据当前时间解析成具体日期或带时区 datetime。
- 配方奶 formula 优先需要 amount_ml；母乳 breast 优先需要 duration_min。
- 小睡 nap 的 night_wakings 应为 0。
- 如果关键字段缺失，把字段名放入 missing_slots，并给 user_facing_question。
- 如果用户说“不是”“不对”“改成”等短句，并且上下文显示刚刚有记录，
  优先识别为 update_tracker_record，设置 latest_in_conversation=true。
- 如果用户说“刚刚/刚才/上一条/你刚才”并询问“说了什么/记录了什么/完整告诉我”，
  优先识别为 context_question，不要识别成 query_sleep/query_feeding 等业务查询。
- 工具查询必须有明确业务对象；短期上下文问题不是业务数据查询。
- 不确定时用 unknown 或低 confidence，不要硬猜。
- 只输出 JSON 对象，不要 markdown，不要代码块。
"""


def _strip_json_fence(content: str) -> str:
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _message_content_as_text(content: object) -> str:
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)


async def classify_tracker_intent(
    message: str,
    now: datetime | None = None,
    *,
    recent_context: str | None = None,
    active_task_payload: dict | None = None,
) -> TrackerIntent:
    current_time = now or datetime.now(APP_TIMEZONE)
    context_part = f"\n最近上下文：\n{recent_context}\n" if recent_context else ""
    task_part = ""
    if active_task_payload:
        task_part = (
            "\n当前未完成任务 JSON：\n"
            f"{json.dumps(active_task_payload, ensure_ascii=False)}\n"
        )
    user_prompt = (
        f"当前时间：{current_time.isoformat()}\n"
        f"{context_part}"
        f"{task_part}"
        f"用户消息：{message}\n\n"
        "请输出 tracker intent JSON。"
    )
    model = create_chat_model("default")
    response = await model.ainvoke(
        [
            SystemMessage(content=TRACKER_INTENT_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
    )
    raw = _strip_json_fence(_message_content_as_text(response.content))
    try:
        return TrackerIntent.model_validate_json(raw)
    except ValidationError:
        data = json.loads(raw)
        return TrackerIntent.model_validate(data)
