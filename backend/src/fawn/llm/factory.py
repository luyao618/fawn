from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from fawn.config import get_settings


def create_chat_model(purpose: str = "default") -> BaseChatModel:
    if purpose not in {"default", "summary", "vision"}:
        raise ValueError(f"Unknown purpose: {purpose}")

    config = get_settings().llm
    provider = getattr(config, f"{purpose}_provider", None) or config.default_provider
    model = getattr(config, f"{purpose}_model", None) or config.default_model

    if provider == "anthropic":
        kwargs = {"model": model, "timeout": config.request_timeout_seconds}
        if config.anthropic_api_key:
            kwargs["api_key"] = config.anthropic_api_key
        return ChatAnthropic(**kwargs)
    if provider == "openai":
        kwargs = {"model": model, "timeout": config.request_timeout_seconds}
        if config.openai_api_key:
            kwargs["api_key"] = config.openai_api_key
        if config.openai_api_base:
            kwargs["base_url"] = config.openai_api_base
        return ChatOpenAI(**kwargs)
    raise ValueError(f"Unknown provider: {provider}")
