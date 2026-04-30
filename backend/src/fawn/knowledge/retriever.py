from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.config import get_settings
from fawn.knowledge import get_embeddings
from fawn.models import KnowledgeChunk


async def retrieve(
    db: AsyncSession,
    query: str,
    top_k: int | None = None,
    threshold: float | None = None,
    raw: bool = False,
) -> list[dict[str, Any]]:
    settings = get_settings()
    top_k = top_k if top_k is not None else settings.rag_top_k
    threshold = threshold if threshold is not None else settings.rag_similarity_threshold

    embeddings_model = get_embeddings()
    query_embedding = await embeddings_model.aembed_query(query)

    stmt = (
        select(
            KnowledgeChunk,
            (1 - KnowledgeChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
        )
        .options(selectinload(KnowledgeChunk.document))
        .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding).asc())
        .limit(top_k)
    )

    result = await db.execute(stmt)
    rows = result.all()

    results = []
    for chunk, similarity in rows:
        if not raw and similarity < threshold:
            continue
        results.append({
            "content": chunk.content,
            "chapter_title": chunk.chapter_title,
            "document_title": chunk.document.title if chunk.document else None,
            "document_source": chunk.document.source if chunk.document else None,
            "similarity": round(float(similarity), 4),
        })

    return results
