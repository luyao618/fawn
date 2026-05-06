"""Add registration family key and nullable baby profile fields."""

from __future__ import annotations

from collections.abc import Sequence
import re

from alembic import op
import sqlalchemy as sa

revision: str = "007_register_empty_baby"
down_revision: str | None = "006_agent_tasks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _display_family_name(value: str) -> str:
    name = re.sub(r"\s+", " ", value.strip())
    if not name:
        raise ValueError("Family name is required")
    return name


def _normalize_family_name(value: str) -> str:
    return _display_family_name(value).casefold()


def _family_rows(connection) -> list[tuple[object, str]]:
    rows = connection.execute(sa.text("SELECT id, name FROM families ORDER BY created_at ASC")).all()
    return [(row.id, row.name) for row in rows]


def _preflight_family_name_keys(connection) -> dict[object, str]:
    keys: dict[object, str] = {}
    duplicates: dict[str, list[str]] = {}
    for family_id, name in _family_rows(connection):
        key = _normalize_family_name(name)
        keys[family_id] = key
        duplicates.setdefault(key, []).append(f"{family_id}:{name}")
    conflicts = {key: values for key, values in duplicates.items() if len(values) > 1}
    if conflicts:
        details = "; ".join(f"{key} -> {', '.join(values)}" for key, values in conflicts.items())
        raise RuntimeError(f"Duplicate normalized family names must be resolved first: {details}")
    return keys


def upgrade() -> None:
    connection = op.get_bind()
    family_keys = _preflight_family_name_keys(connection)

    op.add_column("families", sa.Column("name_key", sa.String(100), nullable=True))
    for family_id, key in family_keys.items():
        connection.execute(
            sa.text("UPDATE families SET name_key = :name_key WHERE id = :family_id"),
            {"name_key": key, "family_id": family_id},
        )

    missing_count = connection.execute(
        sa.text("SELECT COUNT(*) FROM families WHERE name_key IS NULL OR name_key = ''")
    ).scalar_one()
    if missing_count:
        raise RuntimeError("Failed to backfill families.name_key")

    op.alter_column("families", "name_key", existing_type=sa.String(100), nullable=False)
    op.create_unique_constraint("uq_families_name_key", "families", ["name_key"])

    op.alter_column("babies", "name", existing_type=sa.String(100), nullable=True)
    op.alter_column("babies", "gender", existing_type=sa.String(10), nullable=True)
    op.alter_column("babies", "birth_date", existing_type=sa.Date(), nullable=True)


def downgrade() -> None:
    op.alter_column("babies", "birth_date", existing_type=sa.Date(), nullable=False)
    op.alter_column("babies", "gender", existing_type=sa.String(10), nullable=False)
    op.alter_column("babies", "name", existing_type=sa.String(100), nullable=False)
    op.drop_constraint("uq_families_name_key", "families", type_="unique")
    op.drop_column("families", "name_key")
