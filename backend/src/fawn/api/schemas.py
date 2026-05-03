import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

UserAccessType = Literal["parent", "family", "friend"]
TrackerType = Literal["growth", "feeding", "sleep", "health"]
MessageType = Literal["text", "image", "data_card", "safety_alert"]


class UserPermissions(BaseModel):
    can_upload_photos: bool = True
    can_write_tracker: bool = False


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    username: str
    display_name: str
    access_type: UserAccessType
    role: str
    avatar_url: str | None = None
    permissions: UserPermissions


class FamilyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class FamilyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=128)
    access_type: UserAccessType
    role: str = Field(min_length=1, max_length=100)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    access_type: UserAccessType | None = None
    role: str | None = Field(default=None, min_length=1, max_length=100)


class UserPasswordUpdate(BaseModel):
    password: str = Field(min_length=6, max_length=128)


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
    sender_user_id: uuid.UUID | None = None
    sender: UserRead | None = None
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
    notes: str | None = None


class GrowthRecordCreate(BaseModel):
    measurement_date: date
    weight_g: int | None = Field(default=None, gt=0)
    height_cm: float | None = Field(default=None, gt=0)
    head_cm: float | None = Field(default=None, gt=0)
    notes: str | None = None


class GrowthReferenceP50(BaseModel):
    measurement_date: date
    age_days: int
    age_display: str
    weight_g: float | None = None
    height_cm: float | None = None
    head_cm: float | None = None


class FeedingRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    feed_time: datetime
    feed_type: Literal["breast", "formula", "solid"]
    amount_ml: int | None = None
    duration_min: int | None = None
    notes: str | None = None


class FeedingRecordCreate(BaseModel):
    feed_time: datetime
    feed_type: Literal["breast", "formula", "solid"]
    amount_ml: int | None = Field(default=None, gt=0)
    duration_min: int | None = Field(default=None, gt=0)
    notes: str | None = None


class SleepRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sleep_start: datetime
    sleep_end: datetime | None = None
    night_wakings: int
    sleep_type: Literal["nap", "night"]
    notes: str | None = None


class SleepRecordCreate(BaseModel):
    sleep_start: datetime
    sleep_end: datetime | None = None
    night_wakings: int = Field(default=0, ge=0)
    sleep_type: Literal["nap", "night"]
    notes: str | None = None


class HealthRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_date: date
    record_type: Literal["vaccination", "illness", "checkup"]
    title: str
    description: str | None = None


class HealthRecordCreate(BaseModel):
    record_date: date
    record_type: Literal["vaccination", "illness", "checkup"]
    title: str = Field(min_length=1, max_length=200)
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


class DashboardBabySummary(BaseModel):
    name: str
    gender: Literal["male", "female"]
    birth_date: date
    age_days: int
    age_display: str


class DashboardLatestGrowth(BaseModel):
    date: date
    weight_g: int | None = None
    weight_percentile: float | None = None
    height_cm: float | None = None
    height_percentile: float | None = None


class DashboardTodayFeeding(BaseModel):
    total_ml: int
    breast_duration_min: int
    count: int
    last_feed_time: datetime | None = None


class DashboardTodaySleep(BaseModel):
    total_hours: float | None = None
    night_wakings: int | None = None


class DashboardSummary(BaseModel):
    baby: DashboardBabySummary
    latest_growth: DashboardLatestGrowth | None
    today_feeding: DashboardTodayFeeding
    today_sleep: DashboardTodaySleep


class WHOReferencePoint(BaseModel):
    age_months: float
    value: float


class WHOReferenceLines(BaseModel):
    p3: list[WHOReferencePoint]
    p15: list[WHOReferencePoint]
    p50: list[WHOReferencePoint]
    p85: list[WHOReferencePoint]
    p97: list[WHOReferencePoint]


class GrowthChartRecord(BaseModel):
    date: date
    weight_g: int | None = None
    height_cm: float | None = None
    head_cm: float | None = None


class GrowthWHOReference(BaseModel):
    weight: WHOReferenceLines
    height: WHOReferenceLines
    head: WHOReferenceLines


class GrowthChartData(BaseModel):
    records: list[GrowthChartRecord]
    who_reference: GrowthWHOReference


class FeedingStatsDay(BaseModel):
    date: date
    total_ml: int
    breast_duration_min: int
    count: int


class FeedingStatsData(BaseModel):
    days: int
    daily: list[FeedingStatsDay]
    average_daily_ml: float
    average_daily_breast_duration_min: float
    average_daily_count: float


class SleepStatsDay(BaseModel):
    date: date
    total_hours: float | None = None
    night_wakings: int | None = None


class SleepStatsData(BaseModel):
    days: int
    daily: list[SleepStatsDay]
    average_daily_hours: float | None
    average_night_wakings: float | None


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


class PhotoDownloadResponse(BaseModel):
    download_url: str
    expires_in_seconds: int = 300


class ProfileItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scope: Literal["user", "family"] = "user"
    content: str
    created_at: datetime
    updated_at: datetime


class ProfileItemCreate(BaseModel):
    content: str = Field(min_length=1)


class ProfileItemUpdate(BaseModel):
    content: str = Field(min_length=1)
