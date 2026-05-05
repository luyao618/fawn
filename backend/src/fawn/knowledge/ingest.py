from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pymupdf
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.knowledge.chunk_quality import is_reference_like_chunk
from fawn.knowledge import get_embeddings
from fawn.models import KnowledgeChunk, KnowledgeDocument
from fawn.services.storage import put_bytes

_SMALL_CHUNK_THRESHOLD = 50
_FORCE_SPLIT_THRESHOLD = 3000
_EMBEDDING_BATCH_SIZE = 100

_CH_CHAPTER_RE = re.compile(
    r"^(第[一二三四五六七八九十百千\d]+[章部分节篇]+[^\n]*)", re.MULTILINE
)
_UPPERCASE_SECTION_RE = re.compile(r"^([A-Z][A-Z\s]{4,})$", re.MULTILINE)
_MD_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)


def _read_file(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        doc = pymupdf.open(file_path)
        return "\n\n".join(page.get_text() for page in doc)
    return file_path.read_text(encoding="utf-8")


def _parse_chapters_md(text: str) -> list[tuple[str, str]]:
    chapters: list[tuple[str, str]] = []
    matches = list(_MD_HEADING_RE.finditer(text))
    if not matches:
        return [("", text)]

    if matches[0].start() > 0:
        chapters.append(("", text[: matches[0].start()].strip()))

    for i, m in enumerate(matches):
        level = len(m.group(1))
        title = m.group(2).strip()
        start = m.end()
        end = len(text)
        for j in range(i + 1, len(matches)):
            if len(matches[j].group(1)) <= level:
                end = matches[j].start()
                break
        chapters.append((title, text[start:end].strip()))

    return chapters


def _parse_chapters_txt(text: str) -> list[tuple[str, str]]:
    splits: list[tuple[int, int, str]] = []

    for m in _CH_CHAPTER_RE.finditer(text):
        splits.append((m.start(), m.end(), m.group(1).strip()))

    for m in _UPPERCASE_SECTION_RE.finditer(text):
        splits.append((m.start(), m.end(), m.group(1).strip()))

    if not splits:
        return [("", text)]

    splits.sort(key=lambda x: x[0])

    chapters: list[tuple[str, str]] = []
    if splits[0][0] > 0:
        chapters.append(("", text[: splits[0][0]].strip()))

    for i, (start, heading_end, title) in enumerate(splits):
        end = splits[i + 1][0] if i + 1 < len(splits) else len(text)
        chapters.append((title, text[heading_end:end].strip()))

    return chapters


def _apply_quality_guards(chunks: list[str]) -> list[str]:
    if not chunks:
        return chunks

    merged: list[str] = []
    for chunk in chunks:
        if len(chunk) < _SMALL_CHUNK_THRESHOLD and merged:
            merged[-1] = merged[-1] + "\n" + chunk
        else:
            merged.append(chunk)

    if len(merged) > 1 and len(merged[0]) < _SMALL_CHUNK_THRESHOLD:
        merged[1] = merged[0] + "\n" + merged[1]
        merged.pop(0)

    return merged


def _split_chapter(
    content: str, chunk_size: int, chunk_overlap: int
) -> list[str]:
    if len(content) <= chunk_size and len(content) <= _FORCE_SPLIT_THRESHOLD:
        return [content] if content.strip() else []

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    return splitter.split_text(content)


def _chunk_document(
    text: str, doc_type: str, file_path: Path
) -> list[tuple[str, str]]:
    if doc_type == "checklist":
        return [("", text)]

    if doc_type == "guide_en":
        chapters = _parse_chapters_md(text)
        chunk_size, overlap = 800, 120
    elif doc_type == "book_zh":
        suffix = file_path.suffix.lower()
        if suffix == ".md":
            chapters = _parse_chapters_md(text)
        else:
            chapters = _parse_chapters_txt(text)
        chunk_size, overlap = 500, 80
    else:
        chapters = _parse_chapters_md(text)
        chunk_size, overlap = 800, 120

    result: list[tuple[str, str]] = []
    for title, content in chapters:
        if not content.strip():
            continue
        raw_chunks = _split_chapter(content, chunk_size, overlap)
        cleaned = _apply_quality_guards(raw_chunks)
        for c in cleaned:
            if is_reference_like_chunk(c, title):
                continue
            result.append((title, c))

    return result


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
    doc_type: str = "book_zh",
    document_metadata: dict | None = None,
    publish_date: date | None = None,
) -> KnowledgeDocument:
    content = _read_file(file_path)

    storage_key = f"knowledge/{source}/{file_path.name}"
    put_bytes(storage_key, content.encode("utf-8"), "text/plain")

    doc = KnowledgeDocument(
        title=title,
        author=author,
        source=source,
        file_key=storage_key,
        doc_type=doc_type,
        document_metadata=document_metadata or {},
        publish_date=publish_date,
    )
    db.add(doc)
    await db.flush()

    chunks = _chunk_document(content, doc_type, file_path)
    if not chunks:
        await db.commit()
        await db.refresh(doc)
        return doc

    chunk_texts = [c[1] for c in chunks]
    embeddings_model = get_embeddings()

    all_embeddings: list[list[float]] = []
    for i in range(0, len(chunk_texts), _EMBEDDING_BATCH_SIZE):
        batch = chunk_texts[i : i + _EMBEDDING_BATCH_SIZE]
        batch_embeddings = await embeddings_model.aembed_documents(batch)
        all_embeddings.extend(batch_embeddings)

    for index, ((chapter_title, chunk_text), embedding) in enumerate(
        zip(chunks, all_embeddings)
    ):
        chunk = KnowledgeChunk(
            document_id=doc.id,
            content=chunk_text,
            chapter_title=chapter_title or None,
            chunk_index=index,
            embedding=embedding,
        )
        db.add(chunk)

    await db.commit()
    await db.refresh(doc)
    return doc
