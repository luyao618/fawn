"""Replace messages conversation_id+created_at asc index with cursor (desc, desc).

This index supports the cursor pagination query introduced in
`GET /chat/conversations/{id}?before=&limit=` which orders by
`(created_at DESC, id DESC)` for tie-breaker safety.
"""

from collections.abc import Sequence

from alembic import op


revision: str = "011_messages_cursor_index"
down_revision: str | None = "010_push_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("idx_messages_conversation", table_name="messages")
    op.execute(
        "CREATE INDEX idx_messages_conversation_cursor "
        "ON messages (conversation_id, created_at DESC, id DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_messages_conversation_cursor")
    op.create_index(
        "idx_messages_conversation",
        "messages",
        ["conversation_id", "created_at"],
    )
