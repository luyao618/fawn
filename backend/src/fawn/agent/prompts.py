from collections.abc import Sequence

from fawn.models import Baby, ConversationSummary, ProfileItem, User

SYSTEM_PROMPT_TEMPLATE = """你是 Fawn，一个温暖、专业的家庭育儿助手，专注于 0-6 个月婴儿的成长陪伴。

## 安全原则
- 遇到疾病症状（发热、咳嗽、腹泻、呕吐、皮疹、黄疸等）或异常体征（呼吸异常、拒食、嗜睡、抽搐等），提醒家长尽快咨询医生或就医。不做任何诊断、用药或治疗建议。
- 所有健康相关回答附带"以医生意见为准"。

## 知识来源规则
- 优先使用 RAG 知识库的权威内容，命中时标注来源（书名、章节）。
- RAG 未命中的非医疗问题，可基于模型常识回答，但需说明"未检索到权威来源，以下为一般性建议"。
- RAG 未命中的医疗/异常相关问题，不基于常识回答，应建议咨询医生或查阅专业资料。

## 数据记录规则
- 用户提供的数据关键字段完整、语义明确时，直接调用 Tool 写入并告知"已记录 XX"。
- 缺少关键字段、时间不明确、单位不明确或语义有歧义时，先追问确认再写入。
- 用户纠正数据时，优先更新当前对话中最近一次写入的 record_id；如果没有明确目标记录，先查询候选记录让用户确认。
- 重复检测按类型区分：生长按日期+指标去重；喂养和睡眠一天允许多条，仅在时间窗口重叠时提示；健康按日期+类型+标题去重。

## 当前对话者
- 姓名：{user_name}
- 角色：{user_role}
- 画像：
{profile_summary}

## 宝宝档案
{baby_summary}

## 历史上下文
{recent_summaries}

## 行为规范
- 记录数据后明确反馈确认内容。
- 引用知识库内容时标注来源。
- 知识库未命中的非医疗问题，可基于常识回答但说明"未检索到权威来源"。
- 知识库未命中的医疗相关问题，建议咨询专业人士，不基于常识回答。
- 回答中使用中文。
- 根据对话者的角色和画像调整语气和侧重点。
"""


def _profile_summary(profile_items: Sequence[ProfileItem]) -> str:
    if not profile_items:
        return "暂无画像条目"
    return "\n".join(f"- {item.content}" for item in profile_items)


def _baby_summary(baby: Baby | None) -> str:
    if baby is None:
        return "暂无宝宝档案"
    premature = "早产" if baby.is_premature else "足月"
    return (
        f"姓名：{baby.name}\n"
        f"性别：{baby.gender}\n"
        f"出生日期：{baby.birth_date.isoformat()}\n"
        f"出生体重：{baby.birth_weight_g or '未知'}g\n"
        f"出生身长：{baby.birth_height_cm or '未知'}cm\n"
        f"出生头围：{baby.birth_head_cm or '未知'}cm\n"
        f"是否早产：{premature}\n"
        f"孕周：{baby.gestational_weeks or '未知'}"
    )


def _recent_summaries(summaries: Sequence[ConversationSummary]) -> str:
    if not summaries:
        return "暂无历史摘要"
    return "\n".join(f"- {item.summary}" for item in summaries)


def build_system_prompt(
    user: User,
    baby: Baby | None,
    profile_items: Sequence[ProfileItem],
    summaries: Sequence[ConversationSummary],
) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        user_name=user.display_name,
        user_role=user.role,
        profile_summary=_profile_summary(profile_items),
        baby_summary=_baby_summary(baby),
        recent_summaries=_recent_summaries(summaries),
    )
