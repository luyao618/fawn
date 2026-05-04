"""Add structured agent task working memory."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006_agent_tasks"
down_revision: str | None = "005_family_permissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def uuid_pk() -> sa.Column:
    return sa.Column(
        "id",
        postgresql.UUID(as_uuid=True),
        primary_key=True,
        server_default=sa.text("gen_random_uuid()"),
    )


def timestamp_column(name: str, *, nullable: bool = False, default_now: bool = False) -> sa.Column:
    return sa.Column(
        name,
        sa.DateTime(timezone=True),
        nullable=nullable,
        server_default=sa.text("now()") if default_now else None,
    )


def upgrade() -> None:
    op.create_table(
        "agent_tasks",
        uuid_pk(),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("task_type", sa.String(40), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("missing_slots", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("initiated_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("last_updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("confirmed_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        timestamp_column("expires_at"),
        timestamp_column("completed_at", nullable=True),
        timestamp_column("created_at", default_now=True),
        timestamp_column("updated_at", default_now=True),
        sa.CheckConstraint(
            "task_type IN ('tracker_create', 'tracker_update', 'tracker_delete', "
            "'baby_profile_update')",
            name="ck_agent_tasks_task_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'awaiting_confirmation', 'completed', "
            "'cancelled', 'expired')",
            name="ck_agent_tasks_status",
        ),
        sa.CheckConstraint(
            "risk_level IN ('low', 'medium', 'high')",
            name="ck_agent_tasks_risk_level",
        ),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["initiated_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["last_updated_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["users.id"]),
    )
    op.create_index(
        "idx_agent_tasks_family_status",
        "agent_tasks",
        ["family_id", "status", "expires_at"],
    )
    op.create_index(
        "idx_agent_tasks_conversation",
        "agent_tasks",
        ["conversation_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_agent_tasks_conversation", table_name="agent_tasks")
    op.drop_index("idx_agent_tasks_family_status", table_name="agent_tasks")
    op.drop_table("agent_tasks")
