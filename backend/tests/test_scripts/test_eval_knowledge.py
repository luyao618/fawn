from __future__ import annotations

from typing import Any

from scripts.eval_knowledge import evaluate_questions


async def test_evaluate_questions_passes_all_gates() -> None:
    questions = [
        {
            "query": "feeding",
            "expected_source": "Baby Care",
            "expected_keywords": ["feed"],
        }
    ]

    async def retrieve_func(query: str) -> list[dict[str, Any]]:
        return [
            {
                "document_title": "Baby Care",
                "chapter_title": "Feeding",
                "content": "Feed every 2-3 hours with responsive feeding cues.",
                "similarity": 0.91,
                "is_reference_like": False,
            },
            {
                "document_title": "Baby Care",
                "chapter_title": "Feeding",
                "content": "Feeding details and practical guidance.",
                "similarity": 0.88,
                "is_reference_like": False,
            },
            {
                "document_title": "Baby Care",
                "chapter_title": "Feeding",
                "content": "More feeding details.",
                "similarity": 0.86,
                "is_reference_like": False,
            },
        ]

    report = await evaluate_questions(questions, retrieve_func)

    assert report.passed
    assert report.source_pct == 100
    assert report.keyword_pct == 100


async def test_evaluate_questions_fails_reference_dominated_results() -> None:
    questions = [
        {
            "query": "feeding",
            "expected_source": "Baby Care",
            "expected_keywords": ["feed"],
        }
    ]

    async def retrieve_func(query: str) -> list[dict[str, Any]]:
        return [
            {
                "document_title": "Baby Care",
                "chapter_title": "References",
                "content": "Available at https://example.org/a",
                "similarity": 0.91,
                "is_reference_like": True,
            },
            {
                "document_title": "Baby Care",
                "chapter_title": "References",
                "content": "Available at https://example.org/b",
                "similarity": 0.9,
                "is_reference_like": True,
            },
            {
                "document_title": "Baby Care",
                "chapter_title": "Feeding",
                "content": "Feed every 2-3 hours.",
                "similarity": 0.89,
                "is_reference_like": False,
            },
        ]

    report = await evaluate_questions(questions, retrieve_func)

    assert not report.passed
    assert report.reference_dominated == 1
    assert "reference-dominated" in report.failed[0]
