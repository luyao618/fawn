from __future__ import annotations

import argparse
import asyncio
import gzip
import hashlib
import json
import subprocess
import sys

from pathlib import Path
from typing import Any

from sqlalchemy import text

from fawn.config import get_settings
from fawn.db.session import async_session_factory

SEEDS_DIR = Path("seeds")
SEED_FILE = SEEDS_DIR / "knowledge_seed.sql.gz"
PROVENANCE_FILE = SEEDS_DIR / "knowledge_seed.provenance.json"
LOCK_KEY = "hashtext('seed_knowledge')"
LOCK_ATTEMPTS = 3
LOCK_SLEEP = 10


def compute_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_seed_provenance(required: bool) -> dict[str, Any]:
    if not PROVENANCE_FILE.exists():
        if required:
            raise FileNotFoundError(f"{PROVENANCE_FILE} not found")
        return {}
    return json.loads(PROVENANCE_FILE.read_text(encoding="utf-8"))


def validate_seed_artifacts(required: bool) -> str | None:
    if not SEEDS_DIR.exists():
        if required:
            raise FileNotFoundError(f"seeds/ directory not found at {SEEDS_DIR.resolve()}")
        print(f"WARNING: seeds/ directory not found at {SEEDS_DIR.resolve()}, skipping.")
        return None

    if not SEED_FILE.exists():
        if required:
            raise FileNotFoundError(f"{SEED_FILE} not found")
        print(f"WARNING: {SEED_FILE} not found, skipping.")
        return None

    current_hash = compute_sha256(SEED_FILE)
    provenance = load_seed_provenance(required=required)
    expected_hash = provenance.get("seed", {}).get("sha256")
    if expected_hash and expected_hash != current_hash:
        raise RuntimeError(
            f"{SEED_FILE} sha256 does not match {PROVENANCE_FILE}: "
            f"{current_hash} != {expected_hash}"
        )
    if required and not expected_hash:
        raise RuntimeError(f"{PROVENANCE_FILE} does not contain seed.sha256")
    return current_hash


async def acquire_advisory_lock(session) -> bool:
    for attempt in range(1, LOCK_ATTEMPTS + 1):
        result = await session.scalar(text(f"SELECT pg_try_advisory_lock({LOCK_KEY})"))
        if result:
            return True
        print(f"Advisory lock attempt {attempt}/{LOCK_ATTEMPTS} failed, retrying in {LOCK_SLEEP}s...")
        await asyncio.sleep(LOCK_SLEEP)
    return False


async def release_advisory_lock(session) -> None:
    await session.execute(text(f"SELECT pg_advisory_unlock({LOCK_KEY})"))


async def get_stored_hash(session) -> str | None:
    row = await session.execute(
        text("SELECT sha256 FROM seed_metadata WHERE seed_name = 'knowledge_seed'")
    )
    result = row.fetchone()
    return result[0] if result else None


async def upsert_hash(session, new_hash: str) -> None:
    await session.execute(
        text(
            "INSERT INTO seed_metadata (seed_name, sha256) VALUES ('knowledge_seed', :sha256) "
            "ON CONFLICT (seed_name) DO UPDATE SET sha256 = EXCLUDED.sha256, applied_at = now()"
        ),
        {"sha256": new_hash},
    )


def run_psql(connection_url: str, sql_bytes: bytes) -> None:
    # Strip asyncpg driver prefix so psql receives a plain postgres:// URL
    url = connection_url.replace("postgresql+asyncpg://", "postgresql://")
    result = subprocess.run(
        ["psql", url],
        input=sql_bytes,
        capture_output=True,
    )
    if result.returncode != 0:
        print(result.stderr.decode(), file=sys.stderr)
        raise RuntimeError(f"psql exited with code {result.returncode}")


def build_seed_sql(sql_bytes: bytes) -> bytes:
    truncate_prefix = b"BEGIN;\nTRUNCATE knowledge_chunks, knowledge_documents CASCADE;\n"
    commit_suffix = b"\nCOMMIT;\n"
    return truncate_prefix + sql_bytes + commit_suffix


async def seed(force: bool, required: bool = True) -> None:
    current_hash = validate_seed_artifacts(required=required)
    if current_hash is None:
        return
    settings = get_settings()

    async with async_session_factory() as session:
        locked = await acquire_advisory_lock(session)
        if not locked:
            print("WARNING: Could not acquire advisory lock after 3 attempts, skipping seed.")
            return

        try:
            stored_hash = await get_stored_hash(session)

            if stored_hash == current_hash and not force:
                print("Knowledge seed is up to date, skipping.")
                return

            print("Decompressing and running knowledge seed SQL...")
            with gzip.open(SEED_FILE, "rb") as gz:
                sql_bytes = gz.read()

            run_psql(settings.database_url, build_seed_sql(sql_bytes))

            await upsert_hash(session, current_hash)
            await session.commit()
            print("Knowledge seed applied successfully.")
        finally:
            await release_advisory_lock(session)
            await session.commit()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Fawn knowledge base")
    parser.add_argument("--idempotent", action="store_true", help="Skip if hash unchanged (default behavior)")
    parser.add_argument("--force", action="store_true", help="Re-apply seed even if hash matches")
    parser.add_argument(
        "--optional",
        action="store_true",
        help="Allow missing seed artifacts and skip instead of failing",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    asyncio.run(seed(force=args.force, required=not args.optional))


if __name__ == "__main__":
    main()
