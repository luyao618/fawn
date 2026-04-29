from typing import Any

from langchain_core.tools import tool


@tool
async def search_knowledge(query: str) -> dict[str, Any]:
    """Search the parenting knowledge base."""
    return {"results": [], "low_confidence": True, "query": query}
