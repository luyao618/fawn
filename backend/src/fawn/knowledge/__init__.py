"""Knowledge ingestion and retrieval package."""
from __future__ import annotations

from langchain_openai import OpenAIEmbeddings

from fawn.config import get_settings


def get_embeddings() -> OpenAIEmbeddings:
    settings = get_settings()
    kwargs = {
        "model": settings.llm.embedding_model,
        # Some OpenAI-compatible proxies reject scalar string input for embeddings.
        # This keeps LangChain on the batch path: input=["..."].
        "check_embedding_ctx_length": False,
    }
    if settings.llm.embedding_model.startswith("text-embedding-3"):
        kwargs["dimensions"] = settings.llm.embedding_dimensions
    if settings.llm.openai_api_key:
        kwargs["api_key"] = settings.llm.openai_api_key
    if settings.llm.openai_api_base:
        kwargs["base_url"] = settings.llm.openai_api_base
    return OpenAIEmbeddings(**kwargs)
