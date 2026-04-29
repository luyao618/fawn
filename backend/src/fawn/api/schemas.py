import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

UserRole = Literal["admin", "parent", "family"]
TrackerType = Literal["growth", "feeding", "sleep", "health"]
MessageType = Literal["text", "image", "data_card", "safety_alert"]


class UserPermissions(BaseModel):
    can_upload_photos: bool = True
    can_write_tracker: bool = False


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    role: UserRole
    avatar_url: str | None = None
    permissions: UserPermissions


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class LoginResponse(TokenResponse):
    user: UserRead


class PermissionUpdate(UserPermissions):
    pass


class BabyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    gender: Literal["male", "female"]
    birth_date: date
    birth_weight_g: int | None = None
    birth_height_cm: float | None = None
    birth_head_cm: float | None = None
    is_premature: bool
    gestational_weeks: int | None = None


class BabyUpdate(BaseModel):
    name: str | None = None
    gender: Literal["male", "female"] | None = None
    birth_date: date | None = None
    birth_weight_g: int | None = None
    birth_height_cm: float | None = None
    birth_head_cm: float | None = None
    is_premature: bool | None = None
    gestational_weeks: int | None = None


class ConversationRead(BaseModel):
    id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    is_active: bool
    summary: str | None = None
    message_count: int = 0


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: Literal["user", "assistant"]
    content: str
    message_type: MessageType
    metadata: dict[str, Any] | None = Field(default=None, validation_alias="message_metadata")
    created_at: datetime


class ConversationDetail(BaseModel):
    conversation: ConversationRead
    messages: list[MessageRead]


class SendMessageRequest(BaseModel):
    content: str
    image_url: str | None = None


class ChatImageResponse(BaseModel):
    image_url: str
    mime_type: str


class MessageSearchResult(MessageRead):
    conversation_started_at: datetime


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int = 1
    page_size: int = 20


class GrowthRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    measurement_date: date
    weight_g: int | None = None
    height_cm: float | None = None
    head_cm: float | None = None
    weight_percentile: float | None = None
    height_percentile: float | None = None
    head_percentile: float | None = None


class FeedingRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    feed_time: datetime
    feed_type: Literal["breast", "formula", "solid"]
    amount_ml: int | None = None
    duration_min: int | None = None
    notes: str | None = None


class SleepRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sleep_start: datetime
    sleep_end: datetime | None = None
    night_wakings: int
    sleep_type: Literal["nap", "night"]
    notes: str | None = None


class HealthRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_date: date
    record_type: Literal["vaccination", "illness", "checkup"]
    title: str
    description: str | None = None


class TrackerUpdate(BaseModel):
    measurement_date: date | None = None
    weight_g: int | None = None
    height_cm: float | None = None
    head_cm: float | None = None
    feed_time: datetime | None = None
    feed_type: Literal["breast", "formula", "solid"] | None = None
    amount_ml: int | None = None
    duration_min: int | None = None
    sleep_start: datetime | None = None
    sleep_end: datetime | None = None
    night_wakings: int | None = None
    sleep_type: Literal["nap", "night"] | None = None
    record_date: date | None = None
    record_type: Literal["vaccination", "illness", "checkup"] | None = None
    title: str | None = None
    description: str | None = None
    notes: str | None = None


class DashboardSummary(BaseModel):
    baby: dict[str, Any]
    latest_growth: dict[str, Any] | None
    today_feeding: dict[str, Any]
    today_sleep: dict[str, Any]


class WHOReferenceLines(BaseModel):
    p3: list[dict[str, float]]
    p15: list[dict[str, float]]
    p50: list[dict[str, float]]
    p85: list[dict[str, float]]
    p97: list[dict[str, float]]


class GrowthChartData(BaseModel):
    records: list[dict[str, Any]]
    who_reference: dict[str, WHOReferenceLines]


class FeedingStatsData(BaseModel):
    days: int
    daily: list[dict[str, Any]]
    average_daily_ml: float
    average_daily_count: float


class SleepStatsData(BaseModel):
    days: int
    daily: list[dict[str, Any]]
    average_daily_hours: float
    average_night_wakings: float


class PhotoTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tag_type: Literal["scene", "expression", "milestone"]
    tag_value: str
    confidence: float
    is_confirmed: bool


class PhotoRead(BaseModel):
    id: uuid.UUID
    storage_url: str
    original_filename: str
    taken_at: datetime | None
    uploaded_at: datetime
    tags: list[PhotoTagRead] = []


class ProfileItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    created_at: datetime
    updated_at: datetime


class ProfileItemUpdate(BaseModel):
    content: str
