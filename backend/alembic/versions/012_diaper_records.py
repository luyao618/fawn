"""Add diaper tracker records."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "012_diaper_records"
down_revision: str | None = "011_messages_cursor_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def created_at() -> sa.Column:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    )


def updated_at() -> sa.Column:
    return sa.Column(
        "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    )


def upgrade() -> None:
    op.create_table(
        "diaper_records",
        uuid_pk(),
        sa.Column("baby_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("diaper_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("diaper_type", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        created_at(),
        updated_at(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.CheckConstraint(
            "diaper_type IN ('poop', 'pee', 'mixed')",
            name="ck_diaper_records_diaper_type",
        ),
        sa.ForeignKeyConstraint(["baby_id"], ["babies.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["deleted_by"], ["users.id"]),
    )
    op.create_index("idx_diaper_records_time", "diaper_records", ["baby_id", "diaper_time"])
    op.create_index("idx_diaper_records_deleted_at", "diaper_records", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("idx_diaper_records_deleted_at", table_name="diaper_records")
    op.drop_index("idx_diaper_records_time", table_name="diaper_records")
    op.drop_table("diaper_records")
