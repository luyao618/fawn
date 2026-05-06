from __future__ import annotations

import runpy
from pathlib import Path

import pytest

from fawn.services.family import FamilyNameError, display_family_name, normalize_family_name


def test_family_name_normalizer_trims_collapses_and_casefolds() -> None:
    assert display_family_name("  My   Family\tName  ") == "My Family Name"
    assert normalize_family_name("  My   Family\tName  ") == "my family name"


def test_family_name_normalizer_rejects_empty() -> None:
    with pytest.raises(FamilyNameError):
        normalize_family_name(" \t ")


def test_migration_family_name_normalizer_matches_app_helper() -> None:
    migration_path = (
        Path(__file__).resolve().parents[2]
        / "alembic"
        / "versions"
        / "007_register_empty_baby.py"
    )
    migration = runpy.run_path(str(migration_path))

    sample = "  My   Family\tName  "
    assert migration["_normalize_family_name"](sample) == normalize_family_name(sample)
