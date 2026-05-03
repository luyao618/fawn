"""Add family-scoped permissions and shared chat ownership."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "005_family_permissions"
down_revision: str | None = "004_album_soft_delete"
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
        "families",
        uuid_pk(),
        sa.Column("name", sa.String(100), nullable=False),
        created_at(),
        updated_at(),
    )
    op.execute(
        """
        INSERT INTO families (id, name)
        VALUES (
            gen_random_uuid(),
            COALESCE((SELECT name || '的家庭' FROM babies ORDER BY created_at ASC LIMIT 1), '默认家庭')
        )
        """
    )

    op.add_column("users", sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("users", sa.Column("access_type", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint("ck_users_role", "users", type_="check")
    op.alter_column("users", "role", existing_type=sa.String(20), type_=sa.String(100))
    op.execute(
        """
        UPDATE users
        SET access_type = CASE
            WHEN role IN ('admin', 'parent') THEN 'parent'
            WHEN role = 'family' THEN 'family'
            ELSE 'family'
        END
        """
    )
    op.execute("UPDATE users SET role = COALESCE(NULLIF(display_name, ''), role)")
    op.execute("UPDATE users SET family_id = (SELECT id FROM families ORDER BY created_at ASC LIMIT 1)")
    op.alter_column("users", "family_id", nullable=False)
    op.alter_column("users", "access_type", nullable=False)
    op.create_check_constraint(
        "ck_users_access_type",
        "users",
        "access_type IN ('parent', 'family', 'friend')",
    )
    op.create_foreign_key("fk_users_family_id_families", "users", "families", ["family_id"], ["id"])
    op.create_index("idx_users_family", "users", ["family_id"])

    op.add_column("babies", sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("UPDATE babies SET family_id = (SELECT id FROM families ORDER BY created_at ASC LIMIT 1)")
    op.alter_column("babies", "family_id", nullable=False)
    op.create_foreign_key("fk_babies_family_id_families", "babies", "families", ["family_id"], ["id"])
    op.create_index("idx_babies_family", "babies", ["family_id"])

    op.add_column("conversations", sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        """
        UPDATE conversations
        SET family_id = users.family_id
        FROM users
        WHERE conversations.user_id = users.id
        """
    )
    op.execute(
        """
        UPDATE conversations
        SET family_id = (SELECT id FROM families ORDER BY created_at ASC LIMIT 1)
        WHERE family_id IS NULL
        """
    )
    op.alter_column("conversations", "family_id", nullable=False)
    op.create_foreign_key(
        "fk_conversations_family_id_families", "conversations", "families", ["family_id"], ["id"]
    )
    op.create_index("idx_conversations_family", "conversations", ["family_id", "started_at"])

    op.add_column("messages", sa.Column("sender_user_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        """
        UPDATE messages
        SET sender_user_id = conversations.user_id
        FROM conversations
        WHERE messages.conversation_id = conversations.id
          AND messages.role = 'user'
        """
    )
    op.create_foreign_key(
        "fk_messages_sender_user_id_users", "messages", "users", ["sender_user_id"], ["id"]
    )

    op.add_column("profile_items", sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "profile_items",
        sa.Column("scope", sa.String(20), nullable=False, server_default="user"),
    )
    op.execute(
        """
        UPDATE profile_items
        SET family_id = users.family_id
        FROM users
        WHERE profile_items.user_id = users.id
        """
    )
    op.alter_column(
        "profile_items",
        "user_id",
        nullable=True,
        existing_type=postgresql.UUID(as_uuid=True),
    )
    op.create_foreign_key(
        "fk_profile_items_family_id_families",
        "profile_items",
        "families",
        ["family_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_profile_items_scope", "profile_items", "scope IN ('user', 'family')"
    )
    op.create_index("idx_profile_items_family", "profile_items", ["family_id", "scope"])

    for table in ("growth_records", "feeding_records", "sleep_records", "health_records"):
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_deleted_by_users", table, "users", ["deleted_by"], ["id"]
        )
        op.create_index(f"idx_{table}_deleted_at", table, ["deleted_at"])


def downgrade() -> None:
    for table in ("health_records", "sleep_records", "feeding_records", "growth_records"):
        op.drop_index(f"idx_{table}_deleted_at", table_name=table)
        op.drop_constraint(f"fk_{table}_deleted_by_users", table, type_="foreignkey")
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")

    op.drop_index("idx_profile_items_family", table_name="profile_items")
    op.drop_constraint("ck_profile_items_scope", "profile_items", type_="check")
    op.drop_constraint("fk_profile_items_family_id_families", "profile_items", type_="foreignkey")
    op.alter_column(
        "profile_items",
        "user_id",
        nullable=False,
        existing_type=postgresql.UUID(as_uuid=True),
    )
    op.drop_column("profile_items", "scope")
    op.drop_column("profile_items", "family_id")

    op.drop_constraint("fk_messages_sender_user_id_users", "messages", type_="foreignkey")
    op.drop_column("messages", "sender_user_id")

    op.drop_index("idx_conversations_family", table_name="conversations")
    op.drop_constraint("fk_conversations_family_id_families", "conversations", type_="foreignkey")
    op.drop_column("conversations", "family_id")

    op.drop_index("idx_babies_family", table_name="babies")
    op.drop_constraint("fk_babies_family_id_families", "babies", type_="foreignkey")
    op.drop_column("babies", "family_id")

    op.drop_index("idx_users_family", table_name="users")
    op.drop_constraint("fk_users_family_id_families", "users", type_="foreignkey")
    op.drop_constraint("ck_users_access_type", "users", type_="check")
    op.execute("UPDATE users SET role = access_type")
    op.alter_column("users", "role", existing_type=sa.String(100), type_=sa.String(20))
    op.create_check_constraint("ck_users_role", "users", "role IN ('admin', 'parent', 'family')")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "access_type")
    op.drop_column("users", "family_id")

    op.drop_table("families")
