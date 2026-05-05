from __future__ import annotations

import argparse
import asyncio
import gzip
import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

import yaml
from sqlalchemy import func, select

from fawn.config import get_settings
from fawn.db.session import async_session_factory
from fawn.models import KnowledgeChunk, KnowledgeDocument

DEFAULT_MANIFEST = Path(__file__).parent.parent / "knowledge_manifest.yaml"
DEFAULT_SEED = Path(__file__).parent.parent / "seeds" / "knowledge_seed.sql.gz"
DEFAULT_PROVENANCE = Path(__file__).parent.parent / "seeds" / "knowledge_seed.provenance.json"
CHUNKING_INPUTS = [
    Path(__file__).parent.parent / "src" / "fawn" / "knowledge" / "ingest.py",
    Path(__file__).parent.parent / "src" / "fawn" / "knowledge" / "chunk_quality.py",
]


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_manifest(manifest_path: Path) -> dict[str, Any]:
    with manifest_path.open() as f:
        return yaml.safe_load(f)


def _repo_root_for(manifest_path: Path) -> Path:
    return manifest_path.parent.parent


def build_source_fingerprints(manifest_path: Path) -> list[dict[str, Any]]:
    manifest = _load_manifest(manifest_path)
    repo_root = _repo_root_for(manifest_path)
    fingerprints: list[dict[str, Any]] = []
    for entry in manifest["documents"]:
        source_path = repo_root / entry["path"]
        if not source_path.exists():
            raise FileNotFoundError(f"Manifest source not found: {source_path}")
        fingerprints.append(
            {
                "title": entry["title"],
                "source": entry["source"],
                "path": entry["path"],
                "sha256": compute_sha256(source_path),
                "bytes": source_path.stat().st_size,
            }
        )
    return fingerprints


def build_generation_fingerprints() -> list[dict[str, Any]]:
    fingerprints: list[dict[str, Any]] = []
    for path in CHUNKING_INPUTS:
        if path.exists():
            fingerprints.append(
                {
                    "path": str(path.relative_to(Path(__file__).parent.parent)),
                    "sha256": compute_sha256(path),
                }
            )
    return fingerprints


def base_provenance(manifest_path: Path) -> dict[str, Any]:
    settings = get_settings()
    return {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "manifest": {
            "path": str(manifest_path.relative_to(_repo_root_for(manifest_path))),
            "sha256": compute_sha256(manifest_path),
        },
        "documents": build_source_fingerprints(manifest_path),
        "generation_inputs": build_generation_fingerprints(),
        "embedding": {
            "model": settings.llm.embedding_model,
            "dimensions": settings.llm.embedding_dimensions,
        },
    }


async def assert_manifest_loaded(manifest_path: Path) -> None:
    manifest = _load_manifest(manifest_path)
    async with async_session_factory() as session:
        missing: list[str] = []
        empty: list[str] = []
        for entry in manifest["documents"]:
            doc = await session.scalar(
                select(KnowledgeDocument).where(
                    KnowledgeDocument.title == entry["title"],
                    KnowledgeDocument.source == entry["source"],
                )
            )
            if doc is None:
                missing.append(entry["title"])
                continue
            chunks = await session.scalar(
                select(func.count())
                .select_from(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == doc.id)
            )
            if not chunks:
                empty.append(entry["title"])
        if missing or empty:
            raise RuntimeError(
                "Knowledge DB is not ready for seed dump. "
                f"missing={missing or 'none'}, empty={empty or 'none'}"
            )


def _sql_literal(value: Any, cast: str | None = None) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    elif isinstance(value, list):
        text = json.dumps(value, ensure_ascii=False)
    elif isinstance(value, (datetime, UUID)):
        text = str(value)
    elif isinstance(value, Decimal):
        return str(value)
    elif isinstance(value, int):
        return str(value)
    else:
        text = str(value)
    escaped = text.replace("'", "''")
    suffix = f"::{cast}" if cast else ""
    return f"'{escaped}'{suffix}"


def _vector_literal(embedding: list[float]) -> str:
    values = ",".join(f"{float(value):.9g}" for value in embedding)
    return f"'[{values}]'"


def _insert_statement(table: str, columns: list[str], values: list[str]) -> str:
    return f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join(values)});\n"


async def export_seed_sql() -> bytes:
    lines = [
        "-- Fawn knowledge seed data. Generated from manifest-authoritative ingestion.\n",
        "SET check_function_bodies = false;\n",
    ]
    async with async_session_factory() as session:
        docs = list(
            (
                await session.execute(
                    select(KnowledgeDocument).order_by(
                        KnowledgeDocument.title, KnowledgeDocument.source
                    )
                )
            ).scalars()
        )
        for doc in docs:
            lines.append(
                _insert_statement(
                    "knowledge_documents",
                    [
                        "id",
                        "title",
                        "author",
                        "source",
                        "publish_date",
                        "file_key",
                        "created_at",
                        "doc_type",
                        "document_metadata",
                    ],
                    [
                        _sql_literal(doc.id),
                        _sql_literal(doc.title),
                        _sql_literal(doc.author),
                        _sql_literal(doc.source),
                        _sql_literal(doc.publish_date),
                        _sql_literal(doc.file_key),
                        _sql_literal(doc.created_at),
                        _sql_literal(doc.doc_type),
                        _sql_literal(doc.document_metadata or {}, "jsonb"),
                    ],
                )
            )

        chunks = list(
            (
                await session.execute(
                    select(KnowledgeChunk).order_by(
                        KnowledgeChunk.document_id, KnowledgeChunk.chunk_index
                    )
                )
            ).scalars()
        )
        for chunk in chunks:
            lines.append(
                _insert_statement(
                    "knowledge_chunks",
                    [
                        "id",
                        "document_id",
                        "content",
                        "chapter_title",
                        "chunk_index",
                        "embedding",
                        "created_at",
                    ],
                    [
                        _sql_literal(chunk.id),
                        _sql_literal(chunk.document_id),
                        _sql_literal(chunk.content),
                        _sql_literal(chunk.chapter_title),
                        _sql_literal(chunk.chunk_index),
                        _vector_literal(chunk.embedding),
                        _sql_literal(chunk.created_at),
                    ],
                )
            )
    return "".join(lines).encode("utf-8")


async def write_seed_sql(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sql_bytes = await export_seed_sql()
    with output_path.open("wb") as f:
        with gzip.GzipFile(fileobj=f, mode="wb", mtime=0) as gz:
            gz.write(sql_bytes)


def write_provenance(provenance_path: Path, provenance: dict[str, Any]) -> None:
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    provenance_path.write_text(
        json.dumps(provenance, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


async def build_seed(manifest_path: Path, output_path: Path, provenance_path: Path) -> None:
    await assert_manifest_loaded(manifest_path)
    await write_seed_sql(output_path)
    provenance = base_provenance(manifest_path)
    provenance["seed"] = {
        "path": str(output_path.relative_to(Path(__file__).parent.parent)),
        "sha256": compute_sha256(output_path),
        "bytes": output_path.stat().st_size,
    }
    write_provenance(provenance_path, provenance)
    print(f"Wrote {output_path}")
    print(f"Wrote {provenance_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Fawn knowledge seed and provenance")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_SEED)
    parser.add_argument("--provenance", type=Path, default=DEFAULT_PROVENANCE)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(build_seed(args.manifest, args.output, args.provenance))


if __name__ == "__main__":
    main()
