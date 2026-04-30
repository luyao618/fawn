from functools import lru_cache

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
    embedding_model: str = "BAAI/bge-m3"
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
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "fawn"
    minio_use_ssl: bool = False

    llm: LLMConfig = Field(default_factory=LLMConfig)

    jwt_secret: str = "change-me-in-env"
    jwt_expire_minutes: int = 1440

    summary_max_recent: int = 10
    session_timeout_minutes: int = 30

    rag_top_k: int = 5
    rag_similarity_threshold: float = 0.7


@lru_cache
def get_settings() -> Settings:
    return Settings()
