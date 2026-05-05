from __future__ import annotations

import gzip
import json

import pytest

from scripts import seed_knowledge


def _write_seed(tmp_path, monkeypatch, *, provenance_hash: str | None = None):
    seeds_dir = tmp_path / "seeds"
    seeds_dir.mkdir()
    seed_file = seeds_dir / "knowledge_seed.sql.gz"
    with gzip.open(seed_file, "wb") as gz:
        gz.write(b"INSERT INTO knowledge_documents DEFAULT VALUES;")
    current_hash = seed_knowledge.compute_sha256(seed_file)
    provenance_file = seeds_dir / "knowledge_seed.provenance.json"
    provenance_file.write_text(
        json.dumps({"seed": {"sha256": provenance_hash or current_hash}}),
        encoding="utf-8",
    )
    monkeypatch.setattr(seed_knowledge, "SEEDS_DIR", seeds_dir)
    monkeypatch.setattr(seed_knowledge, "SEED_FILE", seed_file)
    monkeypatch.setattr(seed_knowledge, "PROVENANCE_FILE", provenance_file)
    return current_hash


def test_validate_seed_artifacts_requires_seed(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(seed_knowledge, "SEEDS_DIR", tmp_path / "seeds")
    monkeypatch.setattr(seed_knowledge, "SEED_FILE", tmp_path / "seeds" / "knowledge_seed.sql.gz")
    monkeypatch.setattr(
        seed_knowledge,
        "PROVENANCE_FILE",
        tmp_path / "seeds" / "knowledge_seed.provenance.json",
    )

    with pytest.raises(FileNotFoundError):
        seed_knowledge.validate_seed_artifacts(required=True)


def test_validate_seed_artifacts_rejects_hash_mismatch(tmp_path, monkeypatch) -> None:
    _write_seed(tmp_path, monkeypatch, provenance_hash="bad")

    with pytest.raises(RuntimeError, match="sha256 does not match"):
        seed_knowledge.validate_seed_artifacts(required=True)


def test_validate_seed_artifacts_accepts_matching_provenance(tmp_path, monkeypatch) -> None:
    current_hash = _write_seed(tmp_path, monkeypatch)

    assert seed_knowledge.validate_seed_artifacts(required=True) == current_hash


def test_build_seed_sql_only_truncates_knowledge_tables() -> None:
    sql = seed_knowledge.build_seed_sql(b"INSERT INTO knowledge_documents DEFAULT VALUES;")

    assert b"TRUNCATE knowledge_chunks, knowledge_documents CASCADE" in sql
    assert b"families" not in sql
    assert b"users" not in sql
