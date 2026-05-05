from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable

import yaml

from fawn.db.session import async_session_factory
from fawn.knowledge.chunk_quality import is_reference_like_chunk
from fawn.knowledge.retriever import retrieve

DEFAULT_EVAL_PATH = Path(__file__).parent.parent / "knowledge_eval.yaml"
SOURCE_HIT_MIN = 80.0
KEYWORD_RECALL_MIN = 70.0
# Empirical calibration for text-embedding-3-small at 1024 dimensions on this
# mixed Chinese/English corpus: good source+keyword hits cluster around 0.50-0.70.
AVG_TOP1_MIN = 0.55
LOW_CONFIDENCE_MAX = 20.0
LOW_CONFIDENCE_SIMILARITY = 0.5


@dataclass(frozen=True)
class EvalReport:
    total: int
    source_hits: int
    keyword_hits: int
    avg_top1: float
    low_confidence: int
    reference_dominated: int
    failed: list[str]

    @property
    def source_pct(self) -> float:
        return self.source_hits / self.total * 100 if self.total else 0.0

    @property
    def keyword_pct(self) -> float:
        return self.keyword_hits / self.total * 100 if self.total else 0.0

    @property
    def low_confidence_pct(self) -> float:
        return self.low_confidence / self.total * 100 if self.total else 0.0

    @property
    def passed(self) -> bool:
        return (
            self.source_pct >= SOURCE_HIT_MIN
            and self.keyword_pct >= KEYWORD_RECALL_MIN
            and self.avg_top1 >= AVG_TOP1_MIN
            and self.low_confidence_pct <= LOW_CONFIDENCE_MAX
            and self.reference_dominated == 0
        )


def _reference_dominated(results: list[dict[str, Any]]) -> bool:
    top3 = results[:3]
    if len(top3) < 3:
        return False
    answerable = sum(
        1
        for result in top3
        if not result.get("is_reference_like")
        and not is_reference_like_chunk(result["content"], result.get("chapter_title"))
    )
    return answerable < 2


async def evaluate_questions(
    questions: list[dict[str, Any]],
    retrieve_func: Callable[[str], Awaitable[list[dict[str, Any]]]],
) -> EvalReport:
    total = len(questions)
    source_hits = 0
    keyword_hits = 0
    reference_dominated = 0
    top1_sims: list[float] = []
    failed: list[str] = []

    for q in questions:
        query = q["query"]
        expected_source = q["expected_source"]
        expected_keywords = [kw.lower() for kw in q["expected_keywords"]]

        results = await retrieve_func(query)
        top3 = results[:3]

        sources_in_top3 = [r["document_title"] for r in top3]
        hit_source = expected_source in sources_in_top3
        if hit_source:
            source_hits += 1

        combined_content = " ".join(r["content"].lower() for r in top3)
        hit_keyword = any(kw in combined_content for kw in expected_keywords)
        if hit_keyword:
            keyword_hits += 1

        dominated = _reference_dominated(results)
        if dominated:
            reference_dominated += 1

        top1_sim = results[0]["similarity"] if results else 0.0
        top1_sims.append(top1_sim)

        if not hit_source or top1_sim < LOW_CONFIDENCE_SIMILARITY or dominated:
            top1_source = results[0]["document_title"] if results else "N/A"
            reasons = []
            if not hit_source:
                reasons.append("source miss")
            if top1_sim < LOW_CONFIDENCE_SIMILARITY:
                reasons.append("low similarity")
            if dominated:
                reasons.append("reference-dominated")
            failed.append(
                f'  - "{query}" -> top-1 sim={top1_sim:.2f}, source="{top1_source}" '
                f'(expected: "{expected_source}", reasons: {", ".join(reasons)})'
            )

    avg_top1 = sum(top1_sims) / len(top1_sims) if top1_sims else 0.0
    low_conf = sum(1 for s in top1_sims if s < LOW_CONFIDENCE_SIMILARITY)
    return EvalReport(
        total=total,
        source_hits=source_hits,
        keyword_hits=keyword_hits,
        avg_top1=avg_top1,
        low_confidence=low_conf,
        reference_dominated=reference_dominated,
        failed=failed,
    )


async def run_eval(eval_path: Path) -> int:
    with open(eval_path) as f:
        data = yaml.safe_load(f)

    questions = data["questions"]

    async with async_session_factory() as db:
        async def retrieve_query(query: str) -> list[dict[str, Any]]:
            return await retrieve(db, query, top_k=5, raw=True)

        report = await evaluate_questions(questions, retrieve_query)

    def indicator(passed: bool) -> str:
        return "[PASS]" if passed else "[FAIL]"

    print("Knowledge Base Evaluation Report")
    print("================================")
    print(f"Total questions: {report.total}")
    print(f"Source Hit@3:    {report.source_hits}/{report.total} ({report.source_pct:.1f}%)  {indicator(report.source_pct >= SOURCE_HIT_MIN)} (pass >= {SOURCE_HIT_MIN:.0f}%)")
    print(f"Keyword Recall:  {report.keyword_hits}/{report.total} ({report.keyword_pct:.1f}%)  {indicator(report.keyword_pct >= KEYWORD_RECALL_MIN)} (pass >= {KEYWORD_RECALL_MIN:.0f}%)")
    print(f"Avg Top-1 Sim:   {report.avg_top1:.2f}           {indicator(report.avg_top1 >= AVG_TOP1_MIN)} (pass >= {AVG_TOP1_MIN:.2f})")
    print(f"Low Confidence:  {report.low_confidence}/{report.total} ({report.low_confidence_pct:.1f}%)  {indicator(report.low_confidence_pct <= LOW_CONFIDENCE_MAX)} (pass <= {LOW_CONFIDENCE_MAX:.0f}%)")
    print(f"Reference-heavy: {report.reference_dominated}/{report.total}           {indicator(report.reference_dominated == 0)} (pass = 0)")

    if report.failed:
        print("\nFailed cases:")
        for line in report.failed:
            print(line)
    return 0 if report.passed else 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval", type=Path, default=DEFAULT_EVAL_PATH)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(run_eval(args.eval)))


if __name__ == "__main__":
    main()
