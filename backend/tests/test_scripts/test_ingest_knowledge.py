from pathlib import Path

import pytest

from scripts import ingest_knowledge


def test_manifest_path_is_resolved_before_deriving_repo_root(tmp_path, monkeypatch) -> None:
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    manifest = backend_dir / "knowledge_manifest.yaml"
    manifest.write_text("documents: []\n", encoding="utf-8")

    captured = {}

    async def fake_session_factory():
        raise AssertionError("not used")

    class FakeSession:
        async def __aenter__(self):
            captured["cwd"] = Path.cwd()
            return self

        async def __aexit__(self, *args):
            return None

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(ingest_knowledge, "async_session_factory", lambda: FakeSession())

    # Empty manifest should complete even when the path is relative from cwd.
    import asyncio

    asyncio.run(ingest_knowledge.main(Path("backend/knowledge_manifest.yaml"), None, False))
    assert captured["cwd"] == tmp_path


def test_ingest_failure_exits_nonzero(monkeypatch, tmp_path) -> None:
    backend_dir = tmp_path / "backend"
    backend_dir.mkdir()
    manifest = backend_dir / "knowledge_manifest.yaml"
    manifest.write_text(
        """
documents:
  - title: Missing
    source: Test
    publish_date: "2026-01-01"
    doc_type: guide_en
    path: docs/missing.md
""",
        encoding="utf-8",
    )

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

    async def fake_is_already_ingested(*args, **kwargs):
        return False

    monkeypatch.setattr(ingest_knowledge, "async_session_factory", lambda: FakeSession())
    monkeypatch.setattr(ingest_knowledge, "is_already_ingested", fake_is_already_ingested)

    import asyncio

    with pytest.raises(SystemExit) as exc:
        asyncio.run(ingest_knowledge.main(manifest, None, False))
    assert exc.value.code == 1
