from __future__ import annotations

from collections.abc import Iterable
from typing import Any

_NO_SOURCE_PHRASE = "未检索到权威来源"
_MEDICAL_CARE_PHRASES = ("医生", "就医", "专业医疗", "以医生意见为准")
_MEDICAL_TERMS = (
    "发烧",
    "发热",
    "咳嗽",
    "腹泻",
    "呕吐",
    "皮疹",
    "湿疹",
    "黄疸",
    "鼻塞",
    "流鼻涕",
    "感冒",
    "肠绞痛",
    "抽搐",
    "嗜睡",
    "拒食",
    "呼吸",
    "症状",
    "治疗",
    "用药",
    "退烧",
    "jaundice",
    "fever",
    "symptom",
    "treatment",
)


def _as_mapping(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        dumped = value.model_dump()
        return dumped if isinstance(dumped, dict) else None
    return None


def is_medical_query(query: str) -> bool:
    lowered = query.lower()
    return any(term in lowered for term in _MEDICAL_TERMS)


def _knowledge_output_payload(output: Any) -> dict[str, Any] | None:
    payload = _as_mapping(output)
    if payload is not None:
        return payload
    if hasattr(output, "content"):
        return _as_mapping(output.content)
    return None


def _source_label(result: dict[str, Any]) -> str | None:
    title = result.get("document_title")
    if not title:
        return None
    chapter = result.get("chapter_title")
    return f"{title}（{chapter}）" if chapter else str(title)


def _source_labels(tool_outputs: Iterable[Any]) -> list[str]:
    labels: list[str] = []
    for output in tool_outputs:
        payload = _knowledge_output_payload(output)
        if not payload:
            continue
        for result in payload.get("results") or []:
            mapping = _as_mapping(result)
            if not mapping:
                continue
            label = _source_label(mapping)
            if label and label not in labels:
                labels.append(label)
    return labels


def _has_low_confidence_miss(tool_outputs: Iterable[Any]) -> bool:
    for output in tool_outputs:
        payload = _knowledge_output_payload(output)
        if not payload:
            continue
        if payload.get("low_confidence") is True or not payload.get("results"):
            return True
    return False


def enforce_answer_contract(
    response_text: str,
    *,
    user_query: str,
    knowledge_tool_outputs: Iterable[Any],
) -> str:
    """Append missing RAG contract language after model generation.

    The chat route streams model tokens as they arrive, so this function only appends
    corrective text. It avoids rewriting already-streamed content.
    """
    outputs = list(knowledge_tool_outputs)
    if not outputs:
        return response_text

    additions: list[str] = []
    source_labels = _source_labels(outputs)
    medical = is_medical_query(user_query)

    if source_labels and not any(label in response_text for label in source_labels):
        additions.append("来源：" + "；".join(source_labels[:3]))

    if not source_labels and _has_low_confidence_miss(outputs) and _NO_SOURCE_PHRASE not in response_text:
        if medical:
            additions.append(f"{_NO_SOURCE_PHRASE}。")
        else:
            additions.append(f"{_NO_SOURCE_PHRASE}，以上为一般性建议。")

    if medical and not any(phrase in response_text for phrase in _MEDICAL_CARE_PHRASES):
        additions.append("健康相关情况请以医生意见为准；如有异常或担心，请及时咨询医生或就医。")

    if not additions:
        return response_text

    separator = "\n\n" if response_text else ""
    return response_text + separator + "\n".join(additions)
