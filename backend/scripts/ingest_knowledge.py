"""CLI script to ingest knowledge documents into the RAG pipeline."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from fawn.db.session import async_session_factory
from fawn.knowledge.ingest import ingest_document, is_already_ingested


async def main(directory: Path, source: str) -> None:
    if not directory.is_dir():
        print(f"Error: {directory} is not a directory")
        sys.exit(1)

    files = sorted(
        f for ext in ("*.md", "*.txt", "*.pdf")
        for f in directory.glob(f"**/{ext}")
    )
    if not files:
        print(f"No markdown, text, or PDF files found in {directory}")
        sys.exit(1)

    print(f"Found {len(files)} files in {directory}")
    ingested = 0
    skipped = 0

    async with async_session_factory() as db:
        for file_path in files:
            title = file_path.stem.replace("_", " ").replace("-", " ").title()
            if await is_already_ingested(db, title, source):
                print(f"  SKIP: {file_path.name} (already ingested)")
                skipped += 1
                continue
            try:
                doc = await ingest_document(db, file_path, title, source=source)
                print(f"  OK:   {file_path.name} -> {len(doc.chunks)} chunks")
                ingested += 1
            except Exception as exc:
                print(f"  FAIL: {file_path.name} -> {exc}")

    print(f"\nDone: {ingested} ingested, {skipped} skipped, {len(files)} total")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest knowledge documents into Fawn RAG pipeline")
    parser.add_argument("--dir", type=Path, required=True, help="Directory containing documents")
    parser.add_argument("--source", type=str, default="manual", help="Source identifier")
    args = parser.parse_args()
    asyncio.run(main(args.dir, args.source))
