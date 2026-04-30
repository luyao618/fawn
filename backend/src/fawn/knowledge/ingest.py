from __future__ import annotations

from pathlib import Path

import pymupdf
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.config import get_settings
from fawn.knowledge import get_embeddings
from fawn.models import KnowledgeDocument, KnowledgeChunk
from fawn.services.storage import put_bytes


def _read_file(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        doc = pymupdf.open(file_path)
        return "\n\n".join(page.get_text() for page in doc)
    return file_path.read_text(encoding="utf-8")


def _chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    return splitter.split_text(text)


async def is_already_ingested(db: AsyncSession, title: str, source: str) -> bool:
    existing = await db.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.title == title,
            KnowledgeDocument.source == source,
        )
    )
    return existing is not None


async def ingest_document(
    db: AsyncSession,
    file_path: Path,
    title: str,
    author: str | None = None,
    source: str = "manual",
) -> KnowledgeDocument:
    content = _read_file(file_path)

    storage_key = f"knowledge/{source}/{file_path.name}"
    put_bytes(storage_key, content.encode("utf-8"), "text/plain")

    doc = KnowledgeDocument(
        title=title,
        author=author,
        source=source,
        file_key=storage_key,
    )
    db.add(doc)
    await db.flush()

    chunks = _chunk_text(content)
    embeddings_model = get_embeddings()
    embeddings = await embeddings_model.aembed_documents(chunks)

    for index, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
        chunk = KnowledgeChunk(
            document_id=doc.id,
            content=chunk_text,
            chunk_index=index,
            embedding=embedding,
        )
        db.add(chunk)

    await db.commit()
    await db.refresh(doc)
    return doc
