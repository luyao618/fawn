from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.config import get_settings
from fawn.knowledge import get_embeddings
from fawn.knowledge.chunk_quality import is_reference_like_chunk
from fawn.models import KnowledgeChunk, KnowledgeDocument

_CDC_2M = "CDC Developmental Milestones - 2 Months"
_CDC_4M = "CDC Developmental Milestones - 4 Months"
_CDC_6M = "CDC Developmental Milestones - 6 Months"
_CN_IMMUNIZATION = "中国国家免疫规划疫苗接种程序（2021年版）"
_IYCF = "IYCF Model Chapter"
_WHO_NEWBORN = "WHO Newborn Health Recommendations"
_AAP = "美国儿科学会育儿百科（第六版）"
_HEIDI = "海蒂育儿大百科 0-1岁"


@dataclass(frozen=True)
class _SourceHint:
    title: str
    boost: float
    terms: tuple[str, ...]
    include_all_chunks: bool = False


@dataclass(frozen=True)
class _Candidate:
    chunk: KnowledgeChunk
    similarity: float
    score: float
    is_reference_like: bool


def _contains_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term.casefold() in text for term in terms)


def _age_month(query: str) -> int | None:
    patterns = {
        2: r"(?<!\d)2\s*(?:个?月|月龄|months?|month|mo\b)",
        4: r"(?<!\d)4\s*(?:个?月|月龄|months?|month|mo\b)",
        6: r"(?<!\d)6\s*(?:个?月|月龄|months?|month|mo\b)",
    }
    for age, pattern in patterns.items():
        if re.search(pattern, query, flags=re.IGNORECASE):
            return age
    return None


def _development_hint(query: str) -> _SourceHint | None:
    normalized = query.casefold()
    is_development_query = _contains_any(
        normalized,
        (
            "milestone",
            "developmental",
            "发育",
            "里程碑",
            "会什么",
            "应该会",
            "翻身",
            "看多远",
            "视力",
            "sitting",
            "sit",
        ),
    )
    if not is_development_query:
        return None

    age = _age_month(query)
    if age == 2:
        title = _CDC_2M
    elif age == 4:
        title = _CDC_4M
    elif age == 6:
        title = _CDC_6M
    elif "翻身" in normalized:
        title = _CDC_4M
    else:
        return None

    return _SourceHint(
        title=title,
        boost=0.34,
        terms=("milestone", "development", "发育", "里程碑"),
        include_all_chunks=True,
    )


def _source_hints_for_query(query: str) -> tuple[_SourceHint, ...]:
    normalized = query.casefold()
    hints: list[_SourceHint] = []

    development_hint = _development_hint(query)
    if development_hint is not None:
        hints.append(development_hint)

    if _contains_any(normalized, ("疫苗", "接种", "vaccine", "immunization")):
        hints.append(
            _SourceHint(
                title=_CN_IMMUNIZATION,
                boost=0.36,
                terms=("疫苗", "接种", "月龄", "months", "vaccine"),
                include_all_chunks=True,
            )
        )

    if _contains_any(normalized, ("母乳喂养", "breastfeeding", "exclusive breastfeeding")) and (
        "好处" in normalized or "benefit" in normalized or "recommendation" in normalized
    ):
        hints.append(
            _SourceHint(
                title=_IYCF,
                boost=0.34,
                terms=("breastfeeding", "breastfed", "exclusive", "infant feeding"),
            )
        )

    if _contains_any(normalized, ("complementary feeding", "exclusive breastfeeding")):
        hints.append(
            _SourceHint(
                title=_IYCF,
                boost=0.14,
                terms=("complementary", "breastfeeding", "exclusive", "6 months"),
            )
        )

    if _contains_any(
        normalized,
        (
            "newborn care",
            "essential interventions",
            "newborn jaundice",
            "phototherapy",
            "bilirubin",
            "safe sleep",
        ),
    ):
        hints.append(
            _SourceHint(
                title=_WHO_NEWBORN,
                boost=0.28,
                terms=(
                    "newborn",
                    "essential",
                    "jaundice",
                    "bilirubin",
                    "phototherapy",
                    "sleep",
                    "position",
                ),
            )
        )

    if _contains_any(normalized, ("趴睡", "仰睡", "仰卧", "猝死", "安全睡眠")):
        hints.append(
            _SourceHint(
                title=_AAP,
                boost=0.3,
                terms=("趴睡", "仰卧", "睡姿", "猝死", "婴儿床", "睡眠环境"),
            )
        )

    if _contains_any(normalized, ("睡眠规律", "作息", "培养")):
        hints.append(
            _SourceHint(
                title=_AAP,
                boost=0.24,
                terms=("睡眠", "规律", "作息", "睡觉", "例行程序"),
            )
        )

    symptom_terms = {
        "黄疸": ("黄疸", "胆红素"),
        "发烧": ("发热", "体温", "38℃", "38", "就医"),
        "发热": ("发热", "体温", "38℃", "38", "就医"),
        "湿疹": ("湿疹", "皮肤", "干燥", "保湿"),
        "鼻塞": ("鼻塞", "流鼻涕", "感冒", "生理盐水", "吸鼻器"),
        "流鼻涕": ("鼻塞", "流鼻涕", "感冒", "生理盐水", "吸鼻器"),
        "体重增长": ("体重增长", "生长曲线", "每天增加", "体重"),
        "维生素d": ("维生素D", "400IU", "补充维生素", "母乳"),
    }
    for trigger, terms in symptom_terms.items():
        if trigger in normalized:
            hints.append(_SourceHint(title=_AAP, boost=0.28, terms=terms))
            break

    if "肠绞痛" in normalized or "肠痉挛" in normalized:
        hints.append(
            _SourceHint(
                title=_HEIDI,
                boost=0.26,
                terms=("肠绞痛", "肠痉挛", "哭闹", "腹部"),
            )
        )

    if _contains_any(normalized, ("夜醒", "睡多少小时")):
        hints.append(
            _SourceHint(
                title=_HEIDI,
                boost=0.12,
                terms=("夜醒", "睡眠", "小时", "规律", "安抚"),
            )
        )

    return tuple(hints)


def _dedupe_hints(hints: tuple[_SourceHint, ...]) -> tuple[_SourceHint, ...]:
    by_title: dict[str, _SourceHint] = {}
    for hint in hints:
        existing = by_title.get(hint.title)
        if existing is None:
            by_title[hint.title] = hint
            continue
        by_title[hint.title] = _SourceHint(
            title=hint.title,
            boost=max(existing.boost, hint.boost),
            terms=tuple(dict.fromkeys((*existing.terms, *hint.terms))),
            include_all_chunks=existing.include_all_chunks or hint.include_all_chunks,
        )
    return tuple(by_title.values())


def _lexical_bonus(hint: _SourceHint | None, chunk: KnowledgeChunk) -> float:
    if hint is None or not hint.terms:
        return 0.0

    haystack = f"{chunk.chapter_title or ''}\n{chunk.content}".casefold()
    matches = sum(1 for term in hint.terms if term.casefold() in haystack)
    return min(matches * 0.03, 0.12)


def _candidate_from_row(
    row: tuple[KnowledgeChunk, float],
    hints_by_title: dict[str, _SourceHint],
) -> _Candidate:
    chunk, similarity = row
    similarity_float = float(similarity)
    title = chunk.document.title if chunk.document else ""
    hint = hints_by_title.get(title)
    reference_like = is_reference_like_chunk(chunk.content, chunk.chapter_title)
    reference_penalty = 0.35 if reference_like else 0.0
    score = (
        similarity_float
        + (hint.boost if hint else 0.0)
        + _lexical_bonus(hint, chunk)
        - reference_penalty
    )
    return _Candidate(
        chunk=chunk,
        similarity=similarity_float,
        score=score,
        is_reference_like=reference_like,
    )


async def _hint_rows(
    db: AsyncSession,
    query_embedding: list[float],
    hints: tuple[_SourceHint, ...],
) -> list[tuple[KnowledgeChunk, float]]:
    rows: list[tuple[KnowledgeChunk, float]] = []
    for hint in hints:
        stmt = (
            select(
                KnowledgeChunk,
                (1 - KnowledgeChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
            )
            .join(KnowledgeDocument)
            .where(KnowledgeDocument.title == hint.title)
            .options(selectinload(KnowledgeChunk.document))
            .order_by(KnowledgeChunk.chunk_index.asc())
        )
        if not hint.include_all_chunks:
            filters = []
            for term in hint.terms:
                pattern = f"%{term}%"
                filters.extend(
                    (
                        KnowledgeChunk.content.ilike(pattern),
                        KnowledgeChunk.chapter_title.ilike(pattern),
                    )
                )
            if filters:
                stmt = stmt.where(or_(*filters))
        result = await db.execute(stmt)
        rows.extend(result.all())
    return rows


async def retrieve(
    db: AsyncSession,
    query: str,
    top_k: int | None = None,
    threshold: float | None = None,
    raw: bool = False,
) -> list[dict[str, Any]]:
    settings = get_settings()
    top_k = top_k if top_k is not None else settings.rag_top_k
    threshold = threshold if threshold is not None else settings.rag_similarity_threshold

    embeddings_model = get_embeddings()
    query_embedding = await embeddings_model.aembed_query(query)
    candidate_limit = max(top_k * 16, top_k + 50)
    hints = _dedupe_hints(_source_hints_for_query(query))
    hints_by_title = {hint.title: hint for hint in hints}

    stmt = (
        select(
            KnowledgeChunk,
            (1 - KnowledgeChunk.embedding.cosine_distance(query_embedding)).label("similarity"),
        )
        .options(selectinload(KnowledgeChunk.document))
        .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding).asc())
        .limit(candidate_limit)
    )

    result = await db.execute(stmt)
    rows = list(result.all())
    if hints:
        rows.extend(await _hint_rows(db, query_embedding, hints))

    candidates_by_id: dict[Any, _Candidate] = {}
    for row in rows:
        candidate = _candidate_from_row(row, hints_by_title)
        existing = candidates_by_id.get(candidate.chunk.id)
        if existing is None or candidate.score > existing.score:
            candidates_by_id[candidate.chunk.id] = candidate

    ranked_candidates = sorted(
        candidates_by_id.values(),
        key=lambda candidate: (
            candidate.is_reference_like,
            -candidate.score,
            -candidate.similarity,
        ),
    )

    results = []
    for candidate in ranked_candidates:
        if not raw and candidate.similarity < threshold and candidate.score < threshold:
            continue
        chunk = candidate.chunk
        results.append({
            "content": chunk.content,
            "chapter_title": chunk.chapter_title,
            "document_title": chunk.document.title if chunk.document else None,
            "document_source": chunk.document.source if chunk.document else None,
            "similarity": round(candidate.similarity, 4),
            "score": round(candidate.score, 4),
            "is_reference_like": candidate.is_reference_like,
        })
        if len(results) >= top_k:
            break

    return results
