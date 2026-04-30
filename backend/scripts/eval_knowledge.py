from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import yaml

from fawn.db.session import async_session_factory
from fawn.knowledge.retriever import retrieve

DEFAULT_EVAL_PATH = Path(__file__).parent.parent / "knowledge_eval.yaml"


async def run_eval(eval_path: Path) -> None:
    with open(eval_path) as f:
        data = yaml.safe_load(f)

    questions = data["questions"]
    total = len(questions)

    source_hits = 0
    keyword_hits = 0
    top1_sims: list[float] = []
    failed: list[str] = []

    async with async_session_factory() as db:
        for q in questions:
            query = q["query"]
            expected_source = q["expected_source"]
            expected_keywords = [kw.lower() for kw in q["expected_keywords"]]

            results = await retrieve(db, query, top_k=5, raw=True)
            top3 = results[:3]

            sources_in_top3 = [r["document_title"] for r in top3]
            hit_source = expected_source in sources_in_top3
            if hit_source:
                source_hits += 1

            combined_content = " ".join(r["content"].lower() for r in top3)
            hit_keyword = any(kw in combined_content for kw in expected_keywords)
            if hit_keyword:
                keyword_hits += 1

            top1_sim = results[0]["similarity"] if results else 0.0
            top1_sims.append(top1_sim)

            if not hit_source or top1_sim < 0.7:
                top1_source = results[0]["document_title"] if results else "N/A"
                failed.append(
                    f'  - "{query}" → top-1 sim={top1_sim:.2f}, source="{top1_source}" (expected: "{expected_source}")'
                )

    avg_top1 = sum(top1_sims) / len(top1_sims) if top1_sims else 0.0
    low_conf = sum(1 for s in top1_sims if s < 0.7)

    def indicator(passed: bool) -> str:
        return "[PASS]" if passed else "[FAIL]"

    source_pct = source_hits / total * 100
    keyword_pct = keyword_hits / total * 100
    low_conf_pct = low_conf / total * 100

    print("Knowledge Base Evaluation Report")
    print("================================")
    print(f"Total questions: {total}")
    print(f"Source Hit@3:    {source_hits}/{total} ({source_pct:.1f}%)  {indicator(source_pct >= 80.0)} (pass >= 80%)")
    print(f"Keyword Recall:  {keyword_hits}/{total} ({keyword_pct:.1f}%)  {indicator(keyword_pct >= 70.0)} (pass >= 70%)")
    print(f"Avg Top-1 Sim:   {avg_top1:.2f}           {indicator(avg_top1 >= 0.75)} (pass >= 0.75)")
    print(f"Low Confidence:  {low_conf}/{total} ({low_conf_pct:.1f}%)  {indicator(low_conf_pct <= 20.0)} (pass <= 20%)")

    if failed:
        print("\nFailed cases:")
        for line in failed:
            print(line)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--eval", type=Path, default=DEFAULT_EVAL_PATH)
    args = parser.parse_args()
    asyncio.run(run_eval(args.eval))


if __name__ == "__main__":
    main()
