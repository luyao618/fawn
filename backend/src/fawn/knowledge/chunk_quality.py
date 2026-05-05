from __future__ import annotations

import re

_REFERENCE_HEADINGS = (
    "references",
    "bibliography",
    "reference list",
    "参考文献",
    "参考资料",
    "参考",
    "bibliographie",
)
_URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
_DOI_RE = re.compile(r"\bdoi\s*:|\b10\.\d{4,9}/", re.IGNORECASE)
_YEAR_CITATION_RE = re.compile(r"\b(19|20)\d{2}\b")
_SUBSTANTIVE_WORD_RE = re.compile(r"[\u4e00-\u9fffA-Za-z]{2,}")


def _normalized(text: str | None) -> str:
    return (text or "").strip().lower()


def is_reference_like_chunk(content: str, chapter_title: str | None = None) -> bool:
    """Heuristic guard for bibliography/link-heavy chunks that are poor answer sources."""
    text = content.strip()
    if not text:
        return False

    title = _normalized(chapter_title)
    if title and any(heading in title for heading in _REFERENCE_HEADINGS):
        return True

    lowered = text.lower()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return False

    url_count = len(_URL_RE.findall(text))
    doi_count = len(_DOI_RE.findall(text))
    year_count = len(_YEAR_CITATION_RE.findall(text))
    substantive_words = len(_SUBSTANTIVE_WORD_RE.findall(text))
    reference_markers = sum(
        1
        for line in lines
        if _URL_RE.search(line)
        or _DOI_RE.search(line)
        or line.lower().startswith(("retrieved from", "available at", "accessed "))
    )

    first_line = lines[0].lower().rstrip(":：")
    if len(lines) <= 3 and first_line in _REFERENCE_HEADINGS:
        return True

    link_heavy = url_count >= 2 and url_count >= max(1, len(lines) // 3)
    citation_heavy = year_count >= 5 and substantive_words < 80
    marker_heavy = reference_markers >= max(2, len(lines) // 2)
    doi_heavy = doi_count >= 2 and substantive_words < 120

    return link_heavy or citation_heavy or marker_heavy or doi_heavy
