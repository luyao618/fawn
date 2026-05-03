"""Add soft deletion to album photos."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "004_album_soft_delete"
down_revision: str = "003_growth_notes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "photos",
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("idx_photos_deleted_at", "photos", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("idx_photos_deleted_at", table_name="photos")
    op.drop_column("photos", "deleted_by")
    op.drop_column("photos", "deleted_at")
