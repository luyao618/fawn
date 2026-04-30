"""Knowledge ingestion and retrieval package."""
from __future__ import annotations

from langchain_openai import OpenAIEmbeddings

from fawn.config import get_settings


def get_embeddings() -> OpenAIEmbeddings:
    settings = get_settings()
    kwargs = {"model": settings.llm.embedding_model}
    if settings.llm.openai_api_key:
        kwargs["api_key"] = settings.llm.openai_api_key
    if settings.llm.openai_api_base:
        kwargs["base_url"] = settings.llm.openai_api_base
    return OpenAIEmbeddings(**kwargs)
