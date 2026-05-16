"""Add partial unique index enforcing at most one active agent_task_run per (family, name)."""

from collections.abc import Sequence

from alembic import op

revision: str = "009_agent_task_runs_active_uq"
down_revision: str | None = "008_agent_task_runs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_agent_task_runs_active_family_name",
        "agent_task_runs",
        ["family_id", "name"],
        unique=True,
        postgresql_where="status IN ('queued', 'running')",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_agent_task_runs_active_family_name", table_name="agent_task_runs"
    )
