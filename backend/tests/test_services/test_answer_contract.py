from fawn.agent.answer_contract import enforce_answer_contract, is_medical_query


def test_rag_hit_appends_missing_source() -> None:
    result = enforce_answer_contract(
        "可以每2到3小时喂一次。",
        user_query="宝宝多久喂一次奶？",
        knowledge_tool_outputs=[
            {
                "results": [
                    {
                        "document_title": "Baby Care",
                        "chapter_title": "Feeding",
                    }
                ],
                "low_confidence": False,
            }
        ],
    )

    assert "来源：Baby Care（Feeding）" in result


def test_non_medical_miss_appends_no_source_disclosure() -> None:
    result = enforce_answer_contract(
        "可以根据宝宝状态调整。",
        user_query="宝宝喜欢什么睡前仪式？",
        knowledge_tool_outputs=[{"results": [], "low_confidence": True}],
    )

    assert "未检索到权威来源" in result
    assert "一般性建议" in result


def test_medical_miss_appends_conservative_caution() -> None:
    result = enforce_answer_contract(
        "可以先观察。",
        user_query="宝宝发烧怎么办？",
        knowledge_tool_outputs=[{"results": [], "low_confidence": True}],
    )

    assert "未检索到权威来源" in result
    assert "以医生意见为准" in result
    assert "咨询医生或就医" in result


def test_medical_detection_handles_english_terms() -> None:
    assert is_medical_query("newborn jaundice treatment guidelines")
