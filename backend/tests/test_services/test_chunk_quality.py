from fawn.knowledge.chunk_quality import is_reference_like_chunk


def test_reference_heading_marks_chunk_reference_like() -> None:
    assert is_reference_like_chunk(
        "World Health Organization. Infant feeding. 2009.",
        "References",
    )


def test_link_heavy_chunk_is_reference_like() -> None:
    content = "\n".join(
        [
            "Available at https://example.org/a",
            "Retrieved from https://example.org/b",
            "DOI: 10.1234/example",
        ]
    )

    assert is_reference_like_chunk(content)


def test_answerable_parenting_text_is_not_reference_like() -> None:
    content = "宝宝通常需要按需喂养。观察尿量、精神状态和体重增长，比固定次数更重要。"

    assert not is_reference_like_chunk(content, "喂养")
