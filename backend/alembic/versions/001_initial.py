"""Create initial Fawn backend schema."""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "001_initial"
down_revision: str | None = None
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
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        uuid_pk(),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column(
            "permissions",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text(
                """'{"can_upload_photos": true, "can_write_tracker": false}'::jsonb"""
            ),
        ),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        created_at(),
        updated_at(),
        sa.CheckConstraint("role IN ('admin', 'parent', 'family')", name="ck_users_role"),
        sa.UniqueConstraint("username"),
    )

    op.create_table(
        "babies",
        uuid_pk(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("gender", sa.String(10), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=False),
        sa.Column("birth_weight_g", sa.Integer(), nullable=True),
        sa.Column("birth_height_cm", sa.Numeric(5, 2), nullable=True),
        sa.Column("birth_head_cm", sa.Numeric(5, 2), nullable=True),
        sa.Column("is_premature", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("gestational_weeks", sa.Integer(), nullable=True),
        created_at(),
        updated_at(),
        sa.CheckConstraint("gender IN ('male', 'female')", name="ck_babies_gender"),
    )

    op.create_table(
        "conversations",
        uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        created_at(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )

    op.create_table(
        "messages",
        uuid_pk(),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("message_type", sa.String(20), nullable=False, server_default="text"),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        created_at(),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_messages_role"),
        sa.CheckConstraint(
            "message_type IN ('text', 'image', 'data_card', 'safety_alert')",
            name="ck_messages_message_type",
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
    )
    op.create_index("idx_messages_conversation", "messages", ["conversation_id", "created_at"])

    op.create_table(
        "conversation_summaries",
        uuid_pk(),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "key_topics", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
        created_at(),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.UniqueConstraint("conversation_id"),
    )

    op.create_table(
        "profile_items",
        uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        created_at(),
        updated_at(),
        sa.ForeignKeyConstraint(["source_conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )
    op.create_index("idx_profile_items_user", "profile_items", ["user_id"])

    op.create_table(
        "growth_records",
        uuid_pk(),
        sa.Column("baby_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("measurement_date", sa.Date(), nullable=False),
        sa.Column("weight_g", sa.Integer(), nullable=True),
        sa.Column("height_cm", sa.Numeric(5, 2), nullable=True),
        sa.Column("head_cm", sa.Numeric(5, 2), nullable=True),
        sa.Column("weight_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("height_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("head_percentile", sa.Numeric(5, 2), nullable=True),
        sa.Column("source_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        created_at(),
        updated_at(),
        sa.ForeignKeyConstraint(["baby_id"], ["babies.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_conversation_id"], ["conversations.id"]),
    )

    op.create_table(
        "feeding_records",
        uuid_pk(),
        sa.Column("baby_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("feed_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("feed_type", sa.String(20), nullable=False),
        sa.Column("amount_ml", sa.Integer(), nullable=True),
        sa.Column("duration_min", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        created_at(),
        updated_at(),
        sa.CheckConstraint(
            "feed_type IN ('breast', 'formula', 'solid')", name="ck_feeding_records_feed_type"
        ),
        sa.ForeignKeyConstraint(["baby_id"], ["babies.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_conversation_id"], ["conversations.id"]),
    )
    op.create_index("idx_feeding_records_time", "feeding_records", ["baby_id", "feed_time"])

    op.create_table(
        "sleep_records",
        uuid_pk(),
        sa.Column("baby_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sleep_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sleep_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("night_wakings", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sleep_type", sa.String(10), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        created_at(),
        updated_at(),
        sa.CheckConstraint("sleep_type IN ('nap', 'night')", name="ck_sleep_records_sleep_type"),
        sa.ForeignKeyConstraint(["baby_id"], ["babies.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_conversation_id"], ["conversations.id"]),
    )
    op.create_index("idx_sleep_records_time", "sleep_records", ["baby_id", "sleep_start"])

    op.create_table(
        "health_records",
        uuid_pk(),
        sa.Column("baby_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("record_date", sa.Date(), nullable=False),
        sa.Column("record_type", sa.String(20), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        created_at(),
        updated_at(),
        sa.CheckConstraint(
            "record_type IN ('vaccination', 'illness', 'checkup')",
            name="ck_health_records_record_type",
        ),
        sa.ForeignKeyConstraint(["baby_id"], ["babies.id"]),
        sa.ForeignKeyConstraint(["recorded_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_conversation_id"], ["conversations.id"]),
    )
    op.create_index("idx_health_records_date", "health_records", ["baby_id", "record_date"])

    op.create_table(
        "who_growth_reference",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("gender", sa.String(10), nullable=False),
        sa.Column("indicator", sa.String(10), nullable=False),
        sa.Column("age_months", sa.Numeric(5, 2), nullable=False),
        sa.Column("l_value", sa.Numeric(10, 6), nullable=False),
        sa.Column("m_value", sa.Numeric(10, 6), nullable=False),
        sa.Column("s_value", sa.Numeric(10, 6), nullable=False),
        sa.CheckConstraint("gender IN ('male', 'female')", name="ck_who_growth_reference_gender"),
        sa.CheckConstraint(
            "indicator IN ('weight', 'height', 'head')", name="ck_who_growth_reference_indicator"
        ),
    )
    op.create_index(
        "idx_who_ref_lookup",
        "who_growth_reference",
        ["gender", "indicator", "age_months"],
        unique=True,
    )

    op.create_table(
        "photos",
        uuid_pk(),
        sa.Column("baby_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        created_at(),
        sa.ForeignKeyConstraint(["baby_id"], ["babies.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"]),
    )
    op.create_index("idx_photos_time", "photos", ["baby_id", "taken_at"])

    op.create_table(
        "photo_tags",
        uuid_pk(),
        sa.Column("photo_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tag_type", sa.String(20), nullable=False),
        sa.Column("tag_value", sa.String(200), nullable=False),
        sa.Column("confidence", sa.Numeric(3, 2), nullable=False),
        sa.Column("is_confirmed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        created_at(),
        sa.CheckConstraint(
            "tag_type IN ('scene', 'expression', 'milestone')", name="ck_photo_tags_tag_type"
        ),
        sa.CheckConstraint("confidence BETWEEN 0 AND 1", name="ck_photo_tags_confidence"),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_photo_tags_photo", "photo_tags", ["photo_id"])
    op.create_index("idx_photo_tags_type", "photo_tags", ["tag_type", "tag_value"])

    op.create_table(
        "knowledge_documents",
        uuid_pk(),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("author", sa.String(200), nullable=True),
        sa.Column("source", sa.String(500), nullable=False),
        sa.Column("publish_date", sa.Date(), nullable=True),
        sa.Column("file_key", sa.String(500), nullable=False),
        created_at(),
    )

    op.create_table(
        "knowledge_chunks",
        uuid_pk(),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("chapter_title", sa.String(500), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=False),
        created_at(),
        sa.ForeignKeyConstraint(["document_id"], ["knowledge_documents.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_chunks_document", "knowledge_chunks", ["document_id", "chunk_index"])
    op.create_index(
        "idx_chunks_embedding",
        "knowledge_chunks",
        ["embedding"],
        postgresql_using="ivfflat",
        postgresql_ops={"embedding": "vector_cosine_ops"},
        postgresql_with={"lists": 100},
    )


def downgrade() -> None:
    op.drop_index("idx_chunks_embedding", table_name="knowledge_chunks")
    op.drop_index("idx_chunks_document", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_documents")
    op.drop_index("idx_photo_tags_type", table_name="photo_tags")
    op.drop_index("idx_photo_tags_photo", table_name="photo_tags")
    op.drop_table("photo_tags")
    op.drop_index("idx_photos_time", table_name="photos")
    op.drop_table("photos")
    op.drop_index("idx_who_ref_lookup", table_name="who_growth_reference")
    op.drop_table("who_growth_reference")
    op.drop_index("idx_health_records_date", table_name="health_records")
    op.drop_table("health_records")
    op.drop_index("idx_sleep_records_time", table_name="sleep_records")
    op.drop_table("sleep_records")
    op.drop_index("idx_feeding_records_time", table_name="feeding_records")
    op.drop_table("feeding_records")
    op.drop_table("growth_records")
    op.drop_index("idx_profile_items_user", table_name="profile_items")
    op.drop_table("profile_items")
    op.drop_table("conversation_summaries")
    op.drop_index("idx_messages_conversation", table_name="messages")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("babies")
    op.drop_table("users")
