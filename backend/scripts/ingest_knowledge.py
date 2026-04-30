"""CLI script to ingest knowledge documents from a manifest."""
from __future__ import annotations

import argparse
import asyncio
import sys
import traceback
from datetime import date
from pathlib import Path

import yaml
from sqlalchemy import select

from fawn.db.session import async_session_factory
from fawn.knowledge.ingest import ingest_document, is_already_ingested
from fawn.models import KnowledgeDocument


async def main(manifest_path: Path, doc_filter: str | None, force: bool) -> None:
    repo_root = manifest_path.parent.parent
    with manifest_path.open() as f:
        manifest = yaml.safe_load(f)

    documents = manifest["documents"]
    if doc_filter:
        documents = [d for d in documents if d["title"] == doc_filter]
        if not documents:
            print(f"No document with title: {doc_filter!r}")
            sys.exit(1)

    ingested = skipped = failed = 0

    async with async_session_factory() as db:
        for doc_entry in documents:
            title = doc_entry["title"]
            source = doc_entry["source"]
            file_path = repo_root / doc_entry["path"]
            parsed_date = date.fromisoformat(doc_entry["publish_date"]) if doc_entry.get("publish_date") else None

            already = await is_already_ingested(db, title, source)
            if already and not force:
                print(f"  SKIP: {title}")
                skipped += 1
                continue

            if already and force:
                result = await db.execute(
                    select(KnowledgeDocument).where(
                        KnowledgeDocument.title == title,
                        KnowledgeDocument.source == source,
                    )
                )
                existing = result.scalars().all()
                for doc in existing:
                    await db.delete(doc)
                await db.flush()

            try:
                doc = await ingest_document(
                    db, file_path, title,
                    author=doc_entry.get("author"),
                    source=source,
                    doc_type=doc_entry["doc_type"],
                    document_metadata=doc_entry.get("metadata") or {},
                    publish_date=parsed_date,
                )
                total_chars = sum(len(c.content) for c in doc.chunks)
                print(f"  OK:   {title} -> {len(doc.chunks)} chunks, {total_chars} chars")
                ingested += 1
            except Exception:
                print(f"  FAIL: {title}")
                traceback.print_exc()
                failed += 1

    total = ingested + skipped + failed
    print(f"\nDone: {ingested} ingested, {skipped} skipped, {failed} failed, {total} total")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest knowledge documents from a manifest")
    parser.add_argument("--manifest", type=Path, required=True, help="Path to YAML manifest file")
    parser.add_argument("--doc", type=str, default=None, help="Ingest single document by exact title")
    parser.add_argument("--force", action="store_true", help="Delete existing and re-ingest")
    args = parser.parse_args()
    asyncio.run(main(args.manifest, args.doc, args.force))
