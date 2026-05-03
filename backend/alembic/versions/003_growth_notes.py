"""Add notes to growth records."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "003_growth_notes"
down_revision: str = "002_knowledge_v2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("growth_records", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("growth_records", "notes")
