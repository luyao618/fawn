"""Add album thumbnail storage keys."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "013_album_thumbnails"
down_revision: str | None = "012_diaper_records"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "photos",
        sa.Column("thumbnail_storage_key", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("photos", "thumbnail_storage_key")
