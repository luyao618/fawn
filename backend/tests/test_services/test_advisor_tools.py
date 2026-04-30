from __future__ import annotations

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch



async def test_search_knowledge_empty():
    mock_retrieve = AsyncMock(return_value=[])

    @asynccontextmanager
    async def mock_session():
        yield AsyncMock()

    with patch("fawn.agent.tools.advisor.async_session_factory", side_effect=mock_session), \
         patch("fawn.agent.tools.advisor.retrieve", mock_retrieve):
        from fawn.agent.tools.advisor import search_knowledge
        result = await search_knowledge.ainvoke({"query": "baby feeding"})

    assert result["query"] == "baby feeding"
    assert result["results"] == []
    assert result["low_confidence"] is True


async def test_search_knowledge_with_results():
    mock_results = [
        {
            "content": "Feed every 2-3 hours",
            "chapter_title": "Feeding Guide",
            "document_title": "Baby Care",
            "document_source": "manual",
            "similarity": 0.85,
        }
    ]
    mock_retrieve = AsyncMock(return_value=mock_results)

    @asynccontextmanager
    async def mock_session():
        yield AsyncMock()

    with patch("fawn.agent.tools.advisor.async_session_factory", side_effect=mock_session), \
         patch("fawn.agent.tools.advisor.retrieve", mock_retrieve):
        from fawn.agent.tools.advisor import search_knowledge
        result = await search_knowledge.ainvoke({"query": "feeding schedule"})

    assert result["query"] == "feeding schedule"
    assert len(result["results"]) == 1
    assert result["low_confidence"] is False
