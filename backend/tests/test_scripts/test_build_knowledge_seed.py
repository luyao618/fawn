from __future__ import annotations

import uuid

from scripts.build_knowledge_seed import _insert_statement, _sql_literal, _vector_literal


def test_sql_literal_escapes_strings() -> None:
    assert _sql_literal("Baby's guide") == "'Baby''s guide'"


def test_sql_literal_casts_jsonb() -> None:
    assert _sql_literal({"age_months": 2}, "jsonb") == '\'{"age_months": 2}\'::jsonb'


def test_sql_literal_handles_uuid() -> None:
    value = uuid.UUID("00000000-0000-0000-0000-000000000001")

    assert _sql_literal(value) == "'00000000-0000-0000-0000-000000000001'"


def test_vector_literal_uses_pgvector_input_shape() -> None:
    assert _vector_literal([0.1, 2.0]) == "'[0.1,2]'"


def test_insert_statement_is_column_explicit() -> None:
    sql = _insert_statement("knowledge_documents", ["id", "title"], ["'1'", "'Doc'"])

    assert sql == "INSERT INTO knowledge_documents (id, title) VALUES ('1', 'Doc');\n"
