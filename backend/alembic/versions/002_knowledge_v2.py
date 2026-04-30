"""Add doc_type, document_metadata to knowledge_documents; create seed_metadata table."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002_knowledge_v2"
down_revision: str = "001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "knowledge_documents",
        sa.Column("doc_type", sa.String(50), nullable=True),
    )
    op.add_column(
        "knowledge_documents",
        sa.Column(
            "document_metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.create_table(
        "seed_metadata",
        sa.Column("seed_name", sa.String(100), primary_key=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("seed_metadata")
    op.drop_column("knowledge_documents", "document_metadata")
    op.drop_column("knowledge_documents", "doc_type")
