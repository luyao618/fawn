from typing import Any

from langchain_core.tools import tool

from fawn.db.session import async_session_factory
from fawn.knowledge.retriever import retrieve


@tool
async def search_knowledge(query: str) -> dict[str, Any]:
    """Search the parenting knowledge base for relevant information."""
    async with async_session_factory() as db:
        results = await retrieve(db, query)
    return {
        "results": results,
        "low_confidence": len(results) == 0,
        "query": query,
    }
