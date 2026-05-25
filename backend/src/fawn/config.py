from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    default_provider: str = "anthropic"
    default_model: str = "claude-sonnet-4-20250514"
    summary_provider: str | None = None
    summary_model: str | None = None
    vision_provider: str | None = None
    vision_model: str | None = None
    embedding_model: str = "text-embedding-3-small"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = ""
    embedding_dimensions: int = 1024
    request_timeout_seconds: float = 30.0
    tool_calling_enabled: bool = False


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_nested_delimiter="__",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://fawn:fawn@localhost:5432/fawn"

    minio_endpoint: str = "localhost:9000"
    minio_public_endpoint: str | None = None
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "fawn"
    minio_region: str = "us-east-1"
    minio_use_ssl: bool = False
    minio_public_use_ssl: bool | None = None

    llm: LLMConfig = Field(default_factory=LLMConfig)

    jwt_secret: str = "change-me-in-env"
    jwt_expire_minutes: int = 1440
    registration_invite_code: str = "2026"

    summary_max_recent: int = 10
    session_timeout_minutes: int = 30

    rag_top_k: int = 5
    rag_similarity_threshold: float = 0.4

    memory_root: Path = Path("./memory")
    memory_curator_timeout_seconds: float = 8.0

    doubao_api_key: str | None = None
    doubao_tts_resource_id: str = "seed-tts-2.0"
    doubao_tts_speaker: str = "zh_female_vv_uranus_bigtts"
    doubao_tts_audio_format: str = "mp3"
    doubao_tts_sample_rate: int = 24000
    doubao_tts_timeout_seconds: float = 30.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
