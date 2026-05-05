from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import func, select, text

from fawn.config import get_settings
from fawn.db.session import async_session_factory
from fawn.models import KnowledgeChunk, KnowledgeDocument
from scripts.seed_knowledge import (
    SEED_FILE,
    compute_sha256,
    load_seed_provenance,
    validate_seed_artifacts,
)


async def check_database_documents() -> list[str]:
    provenance = load_seed_provenance(required=True)
    documents = provenance.get("documents") or []
    failures: list[str] = []
    async with async_session_factory() as session:
        for entry in documents:
            doc = await session.scalar(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.title == entry["title"],
                    KnowledgeDocument.source == entry["source"],
                )
            )
            if doc is None:
                failures.append(f"missing document: {entry['title']}")
                continue
            chunks = await session.scalar(
                select(func.count())
                .select_from(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == doc.id)
            )
            if not chunks:
                failures.append(f"document has no chunks: {entry['title']}")

        stored_hash = await session.scalar(
            text("SELECT sha256 FROM seed_metadata WHERE seed_name = 'knowledge_seed'")
        )
        expected_hash = provenance.get("seed", {}).get("sha256") or compute_sha256(SEED_FILE)
        if stored_hash != expected_hash:
            failures.append("seed_metadata hash does not match seed artifact")
    return failures


async def run_check(require_tool_calling: bool) -> int:
    failures: list[str] = []
    try:
        validate_seed_artifacts(required=True)
    except Exception as exc:
        failures.append(str(exc))

    if require_tool_calling and not get_settings().llm.tool_calling_enabled:
        failures.append("RAG tool calling is disabled")

    failures.extend(await check_database_documents())

    if failures:
        print("Knowledge readiness failed:")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("Knowledge readiness passed.")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check deployed Fawn RAG readiness")
    parser.add_argument(
        "--allow-tool-calling-disabled",
        action="store_true",
        help="Skip deployed tool-calling readiness check",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    raise SystemExit(asyncio.run(run_check(not args.allow_tool_calling_disabled)))


if __name__ == "__main__":
    main()
