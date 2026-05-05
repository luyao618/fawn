from fawn.knowledge.retriever import (
    _AAP,
    _CDC_4M,
    _CN_IMMUNIZATION,
    _HEIDI,
    _IYCF,
    _WHO_NEWBORN,
    _dedupe_hints,
    _source_hints_for_query,
)


def _hint_titles(query: str) -> set[str]:
    return {hint.title for hint in _source_hints_for_query(query)}


def test_development_queries_hint_age_specific_cdc_checklists() -> None:
    assert _CDC_4M in _hint_titles("4个月宝宝应该会什么？")
    assert _CDC_4M in _hint_titles("什么时候宝宝会翻身？")


def test_vaccine_queries_hint_china_schedule() -> None:
    assert _CN_IMMUNIZATION in _hint_titles("宝宝6个月需要打哪些疫苗？")


def test_cross_language_authority_hints_cover_who_sources() -> None:
    assert _IYCF in _hint_titles("母乳喂养的好处有哪些？")
    assert _WHO_NEWBORN in _hint_titles("newborn jaundice treatment guidelines")


def test_daily_symptom_hints_keep_expected_parenting_sources() -> None:
    assert _AAP in _hint_titles("宝宝鼻塞流鼻涕怎么处理？")
    assert _HEIDI in _hint_titles("婴儿肠绞痛的症状和处理方法")


def test_duplicate_hints_merge_terms_and_keep_highest_boost() -> None:
    hints = _source_hints_for_query("exclusive breastfeeding WHO recommendation")
    deduped = _dedupe_hints(hints)
    iycf_hints = [hint for hint in deduped if hint.title == _IYCF]

    assert len(iycf_hints) == 1
    assert iycf_hints[0].boost == 0.34
    assert "6 months" in iycf_hints[0].terms
