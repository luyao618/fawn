# 06 - 疫苗与分诊规则设计

---
task_id: C2
title: 疫苗与分诊规则设计
status: ready_for_review
version: 0.1.0
last_updated: 2026-04-12
depends_on:
  - B2（来源矩阵）
  - D1（数据模型 / Schema）
  - E1（评测框架）
  - F1（产品边界与安全框架）
downstream:
  - G1（MVP roadmap）
scope: 疫苗提醒与状态管理、症状分诊与风险分级
---

## 1 执行摘要

本文档为"宝宝专属 agent"定义两套核心规则体系：

1. **疫苗规则**——管理从出生到 6 岁的免疫接种提醒、逾期补种、延期处理、禁忌/注意事项筛查和接种后不良反应随访。默认覆盖中国国家免疫规划（NIP），可通过 `schedule_region` 路由扩展至美国 CDC / 国际 WHO 推荐方案。
2. **分诊规则**——当家长描述宝宝症状时，基于确定性规则引擎将场景分为"居家观察 / 尽快就医 / 急诊 120"三级，高风险场景（小月龄发热、呼吸困难、抽搐、持续拒食、发绀、严重过敏等）**一律默认线下就医或急救**，绝不拦截、绝不替代诊断。

核心原则：

| 原则 | 含义 |
|------|------|
| **Not a diagnostic tool** | 产品不做诊断、不开处方、不替代医生。与 F1 安全框架对齐 |
| **Rule-based first** | 疫苗调度与风险分级由确定性规则引擎驱动，LLM 仅做自然语言解析与解释文案 |
| **Conservative by default** | 不确定时一律升级（就医/急救），宁可过度提醒，不可漏报 |
| **Human-in-the-loop** | 免疫规划细目、地方口径、快速变化医学/政策条目显式标注"待人工复核"，不硬编码 |

---

## 2 为什么必须 Rule-Based

### 2.1 LLM 的局限性

| 风险 | 说明 |
|------|------|
| 幻觉 | LLM 可能编造疫苗间隔、剂量或禁忌信息 |
| 不可审计 | 概率性输出无法向监管方证明"为什么给出这个建议" |
| 一致性差 | 同一输入在不同 temperature / prompt 下可能给出相反建议 |
| 延迟变化 | Token 生成时间不可控，紧急分诊不可接受延迟抖动 |

### 2.2 Rule-Based 的优势

- **可审计**：每条规则有唯一 ID、版本号、来源引用，可追溯。
- **可测试**：规则引擎输入/输出完全确定，可做 100% 分支覆盖。
- **可合规**：规则表可提交卫生行政部门或法律顾问审查。
- **低延迟**：规则匹配 < 10ms，不依赖大模型推理。

### 2.3 LLM 的分工

LLM **仅**承担以下角色：

1. **自然语言解析（NLU）**：将家长口语化描述（"宝宝烫烫的"、"拉了好多次"）结构化为 `symptom_event` schema 字段。
2. **解释文案生成**：将规则引擎的输出（如 `triage_level = EMERGENCY`）翻译为家长可读的温暖话术。
3. **澄清追问**：当解析置信度 < 阈值时，生成追问话术以补全缺失字段。

**LLM 不做风险定级、不做疫苗调度决策、不做禁忌判断。**

---

## 3 中国默认与美国/国际扩展

### 3.1 `schedule_region` 路由机制

```
baby_profile.schedule_region ∈ { "CN", "US", "WHO_DEFAULT" }
```

| 字段 | 说明 |
|------|------|
| `schedule_region` | 宝宝注册时根据所在地自动设置，家长可手动切换 |
| 默认值 | `"CN"` |
| 路由逻辑 | 规则引擎加载对应地区的疫苗调度表（`vaccine_schedule_{region}.json`）和分诊规则集（`triage_rules_{region}.json`） |

### 3.2 中国（CN）——国家免疫规划

覆盖一类疫苗（免费、强制）：

| 疫苗 | 简称 | 剂次 | 月龄 | 备注 |
|------|------|------|------|------|
| 乙肝疫苗 | HepB | 3 | 0, 1, 6 | 出生 24h 内首针 |
| 卡介苗 | BCG | 1 | 0 | 出生时 |
| 脊灰疫苗 | IPV/bOPV | 4 | 2, 3, 4, 48 | 2 月龄 IPV，3-4 月龄 bOPV，4 岁 bOPV |
| 百白破疫苗 | DTaP | 4 | 3, 4, 5, 18-24 | — |
| 白破疫苗 | DT | 1 | 72 | 6 岁 |
| 麻腮风疫苗 | MMR | 2 | 8, 18 | 8 月龄可用麻风 MR |
| 乙脑减毒活疫苗 | JE-L | 2 | 8, 24 | — |
| A 群流脑多糖疫苗 | MenA | 2 | 6, 9 | — |
| A+C 群流脑多糖疫苗 | MenAC | 2 | 36, 72 | — |
| 甲肝减毒活疫苗 | HepA-L | 1 | 18 | — |

> **⚠️ 待人工复核**：上表仅作研究设计中的示意性配置样例，具体版本号、地方差异、联合/替代程序与最新补种口径不得直接硬编码，必须在上线前由医学顾问按最新版国家免疫规划文件逐条复核。

二类疫苗（自费、推荐）作为扩展包提供，不做强制提醒，标注"自愿接种，请咨询接种门诊"。

### 3.3 美国（US）——CDC 推荐

覆盖 CDC Advisory Committee on Immunization Practices (ACIP) 推荐方案，含：

- HepB, RV, DTaP, Hib, PCV15/20, IPV, Influenza, MMR, Varicella, HepA, COVID-19 等。
- Catch-up schedule（7-18 岁补种）。

> **⚠️ 待人工复核**：CDC 方案每年更新（通常 2 月发布），需设置年度校验流程。

### 3.4 国际（WHO_DEFAULT）

使用 WHO EPI 基础方案作为 fallback，适用于未覆盖地区的用户。

> **⚠️ 待人工复核**：WHO 方案为最低推荐，各国实际方案可能更严格。

---

## 4 疫苗状态机

每一剂疫苗对应一个状态机实例，与 D1 schema 中的 `vaccine_event` 对齐。

```
                  ┌──────────────────────────────────────────┐
                  │                                          │
                  ▼                                          │
  ┌───────────┐  reminder  ┌───────────┐  接种确认  ┌─────────┐  │
  │ SCHEDULED │──────────▶│  REMINDED  │─────────▶│ GIVEN   │──┘
  └───────────┘            └───────────┘          └─────────┘
       │                        │                      │
       │ 逾期未接种              │ 逾期未接种            │ 不良反应
       ▼                        ▼                      ▼
  ┌───────────┐           ┌───────────┐          ┌──────────────┐
  │  OVERDUE  │◀──────────│  OVERDUE  │          │ ADVERSE_EVT  │
  └───────────┘           └───────────┘          └──────────────┘
       │                                               │
       │ 补种/延期决策                                   │ follow_up
       ▼                                               ▼
  ┌───────────┐                                  ┌──────────────┐
  │ DEFERRED  │                                  │ FOLLOW_UP    │
  └───────────┘                                  └──────────────┘
       │                                               │
       │ 重新调度                                       │ 闭环
       ▼                                               ▼
  ┌───────────┐                                  ┌──────────────┐
  │ SCHEDULED │ (回到起点)                        │  CLOSED      │
  └───────────┘                                  └──────────────┘

  特殊终态：
  ┌────────────────────┐
  │ CONTRAINDICATED    │  禁忌症确认，永久跳过该剂次
  └────────────────────┘
  ┌────────────────────┐
  │ SKIPPED_BY_PARENT  │  家长主动跳过（需记录原因，定期重提醒）
  └────────────────────┘
```

### 4.1 状态定义

| 状态 | 含义 | 触发条件 | D1 对齐 |
|------|------|----------|---------|
| `SCHEDULED` | 已排期，等待接种窗口 | 出生 / 上一剂完成 | `vaccine_event.status` |
| `REMINDED` | 已发送提醒 | 接种窗口前 N 天 | `reminder` 表 |
| `GIVEN` | 已接种 | 家长确认 / 接种记录导入 | `vaccine_event.administered_at` |
| `OVERDUE` | 逾期未接种 | 超过推荐窗口上限 | `vaccine_event.status` |
| `DEFERRED` | 医生建议延期 | 禁忌/疾病/家长请求 | `vaccine_event.defer_reason` |
| `CONTRAINDICATED` | 永久禁忌 | 严重过敏史等 | `vaccine_event.contraindication` |
| `ADVERSE_EVT` | 接种后出现不良反应 | 家长上报 | `symptom_event` 关联 |
| `FOLLOW_UP` | 不良反应随访中 | 系统生成随访任务 | `follow_up_task` |
| `CLOSED` | 随访闭环 | 随访完成 | `follow_up_task.closed_at` |
| `SKIPPED_BY_PARENT` | 家长主动跳过 | 家长操作 | `vaccine_event.skip_reason` |

### 4.2 提醒策略

```yaml
reminder_strategy:
  pre_reminder_days: [7, 3, 1]      # 接种日前 7/3/1 天提醒
  overdue_reminder_days: [1, 7, 14, 30]  # 逾期后 1/7/14/30 天提醒
  max_overdue_reminders: 6           # 最多提醒次数，超过标记需人工介入
  channel: ["push", "in_app"]        # 提醒渠道
  tone: "warm_supportive"            # 话术风格：温暖支持，不制造焦虑
```

### 4.3 逾期与补种规则

```python
# 伪代码：补种窗口判定
def can_catch_up(vaccine_code, baby_age_months, doses_received, region):
    schedule = load_schedule(region)
    rule = schedule.catch_up_rules[vaccine_code]
    
    if baby_age_months > rule.max_catch_up_age_months:
        return CatchUpResult.TOO_OLD  # 超龄，无法补种
    
    min_interval = rule.min_interval_days[doses_received]
    if days_since_last_dose < min_interval:
        return CatchUpResult.TOO_EARLY  # 间隔不足
    
    return CatchUpResult.ELIGIBLE  # 可补种，生成新 SCHEDULED
```

> **⚠️ 待人工复核**：补种最小间隔和最大年龄限制需严格按最新版《国家免疫规划疫苗儿童免疫程序说明》核实。不同疫苗的补种规则差异大（如 BCG 4 岁后不补种），不可泛化。

### 4.4 禁忌与注意事项筛查

接种前触发禁忌筛查流程：

```yaml
contraindication_check:
  trigger: "接种窗口前 1 天 或 家长手动触发"
  flow:
    - ask: "宝宝目前有发热（≥37.3°C）吗？"
    - ask: "宝宝是否正在使用免疫抑制药物？"
    - ask: "上次接种该疫苗后是否出现严重过敏反应？"
    - ask: "宝宝是否有已知的免疫缺陷疾病？"
    # ... 根据具体疫苗展开
  result:
    all_clear: "可以接种，请按时前往接种门诊"
    caution: "存在注意事项，建议接种前咨询医生"      # 状态不变，附加提示
    contraindicated: "存在禁忌，请勿接种并咨询医生"   # 状态 → DEFERRED / CONTRAINDICATED
```

> **⚠️ 待人工复核**：禁忌症清单需逐疫苗核实，参考药品说明书和《预防接种工作规范》。此处仅提供通用筛查框架，具体问题列表需医学顾问审定。

### 4.5 接种后不良反应随访

```yaml
post_vaccination_followup:
  trigger: "接种确认后自动创建"
  schedule:
    - time: "+30min"
      ask: "接种后留观 30 分钟，宝宝目前状态如何？"
    - time: "+4h"
      ask: "宝宝有没有发热、注射部位红肿、哭闹不止等情况？"
    - time: "+24h"
      ask: "宝宝今天状态怎么样？有没有异常反应？"
    - time: "+72h"
      ask: "接种后第 3 天，宝宝恢复得怎么样？"
  escalation:
    mild: "轻微红肿/低热 → 居家观察指导"
    moderate: "持续高热/大面积红肿 → 建议就医"
    severe: "过敏性休克/抽搐/意识改变 → 立即拨打 120"
  creates:
    - follow_up_task    # D1 schema
    - symptom_event     # 如有不良反应上报
    - workflow_run      # 触发分诊流程
```

---

## 5 分诊分级

### 5.1 三级分诊模型

| 级别 | 标签 | 含义 | 响应 |
|------|------|------|------|
| **L1** | `HOME_CARE` | 居家观察 | 提供护理指导，设置随访提醒 |
| **L2** | `SEE_DOCTOR` | 尽快就医 | 建议 24h 内就诊，可提供附近医院信息 |
| **L3** | `EMERGENCY_120` | 急诊/拨打 120 | 立即显示急救提示，引导拨打 120 |

**核心原则：不确定时一律升级。L1 可以误判为 L2，但 L3 绝不可降级。**

### 5.2 高风险规则（L3 — 急诊 120）

以下任一条件匹配即触发 `EMERGENCY_120`，**无需 LLM 参与，规则引擎直接触发**：

```yaml
emergency_rules:
  - rule_id: E001
    name: "新生儿/小月龄发热"
    condition: "baby_age_months < 3 AND temperature >= 38.0"
    level: EMERGENCY_120
    message: "3 月龄以下宝宝发热 ≥38°C，请立即就医或拨打 120。"
    source: "AAP/中华儿科学会指南"
    
  - rule_id: E002
    name: "呼吸困难"
    condition: "symptoms CONTAINS 'breathing_difficulty' AND (respiratory_rate > age_threshold OR retractions OR grunting OR nasal_flaring)"
    level: EMERGENCY_120
    message: "宝宝出现呼吸困难，请立即拨打 120。"
    
  - rule_id: E003
    name: "抽搐/惊厥"
    condition: "symptoms CONTAINS 'seizure'"
    level: EMERGENCY_120
    message: "宝宝出现抽搐，请保持宝宝侧卧、不要往嘴里塞东西，立即拨打 120。"
    
  - rule_id: E004
    name: "发绀"
    condition: "symptoms CONTAINS 'cyanosis' AND NOT (location == 'hands_feet_only' AND baby_age_days < 2)"
    level: EMERGENCY_120
    message: "宝宝嘴唇/面部发紫，请立即拨打 120。"
    
  - rule_id: E005
    name: "严重过敏反应"
    condition: "symptoms CONTAINS 'anaphylaxis' OR (symptoms CONTAINS 'allergy' AND (swelling_face OR breathing_difficulty OR consciousness_change))"
    level: EMERGENCY_120
    message: "疑似严重过敏反应，请立即拨打 120，并尽快按既往医生明确交代的急救方案处理。"
    
  - rule_id: E006
    name: "意识改变"
    condition: "symptoms CONTAINS 'lethargy_unresponsive' OR symptoms CONTAINS 'consciousness_change'"
    level: EMERGENCY_120
    message: "宝宝反应异常迟钝或无法唤醒，请立即拨打 120。"
    
  - rule_id: E007
    name: "持续呕吐+脱水征"
    condition: "symptoms CONTAINS 'vomiting_persistent' AND dehydration_signs >= 2"
    level: EMERGENCY_120
    message: "宝宝持续呕吐伴脱水征象，请立即就医。"
    
  - rule_id: E008
    name: "外伤/误食异物/中毒"
    condition: "symptoms CONTAINS ANY ['foreign_body_ingestion', 'poisoning', 'severe_trauma', 'burn_severe']"
    level: EMERGENCY_120
    message: "请立即拨打 120，并避免自行进行未经专业指导的处置。"
    
  - rule_id: E009
    name: "囟门膨隆"
    condition: "symptoms CONTAINS 'bulging_fontanelle' AND baby_age_months < 18"
    level: EMERGENCY_120
    message: "宝宝囟门膨隆，可能提示颅内压升高，请立即就医。"
```

### 5.3 就医规则（L2 — 尽快就医）

```yaml
see_doctor_rules:
  - rule_id: D001
    name: "3-6月龄发热"
    condition: "baby_age_months >= 3 AND baby_age_months < 6 AND temperature >= 38.5"
    level: SEE_DOCTOR
    message: "建议带宝宝在 24 小时内就诊。"
    
  - rule_id: D002
    name: "大月龄持续高热"
    condition: "baby_age_months >= 6 AND temperature >= 39.0 AND duration_hours >= 24"
    level: SEE_DOCTOR
    
  - rule_id: D003
    name: "腹泻伴轻度脱水"
    condition: "symptoms CONTAINS 'diarrhea' AND stool_count_24h >= 6 AND dehydration_signs >= 1"
    level: SEE_DOCTOR
    
  - rule_id: D004
    name: "持续拒食"
    condition: "feeding_refusal_hours >= 8 AND baby_age_months < 6"
    level: SEE_DOCTOR
    message: "小月龄宝宝持续拒食超过 8 小时，建议就医。"
    
  - rule_id: D005
    name: "皮疹+发热"
    condition: "symptoms CONTAINS 'rash' AND temperature >= 38.0"
    level: SEE_DOCTOR
    
  - rule_id: D006
    name: "耳部疼痛/流脓"
    condition: "symptoms CONTAINS 'ear_pain' OR symptoms CONTAINS 'ear_discharge'"
    level: SEE_DOCTOR
    
  - rule_id: D007
    name: "接种后持续高热"
    condition: "post_vaccination_hours <= 72 AND temperature >= 39.5 AND duration_hours >= 4"
    level: SEE_DOCTOR
```

### 5.4 居家观察规则（L1 — HOME_CARE）

```yaml
home_care_rules:
  - rule_id: H001
    name: "大月龄低热"
    condition: "baby_age_months >= 6 AND temperature >= 37.5 AND temperature < 38.5 AND duration_hours < 24 AND no_other_red_flags"
    level: HOME_CARE
    guidance:
      - "多喂水/奶，保持体液充足"
      - "适当减少衣物，物理降温"
      - "密切观察精神状态"
      - "如体温升高或出现其他症状，请及时就医"
    followup: "+4h"
    
  - rule_id: H002
    name: "轻度腹泻"
    condition: "symptoms CONTAINS 'diarrhea' AND stool_count_24h < 6 AND dehydration_signs == 0"
    level: HOME_CARE
    guidance:
      - "继续母乳/配方奶喂养"
      - "如宝宝能正常饮水，可少量多次补液；如不确定请咨询医生"
      - "观察尿量和精神状态"
    followup: "+8h"
    
  - rule_id: H003
    name: "接种后轻微反应"
    condition: "post_vaccination_hours <= 48 AND (mild_fever OR injection_site_redness_small)"
    level: HOME_CARE
    guidance:
      - "接种后低热和局部红肿是常见反应"
      - "可冷敷注射部位"
      - "如持续超过 48 小时或加重，请就医"
```

### 5.5 分诊流程

```
家长描述症状
      │
      ▼
┌──────────────┐
│ LLM 解析 NLU │ ── 提取结构化字段 → symptom_event schema
└──────────────┘
      │
      │ 置信度 < 阈值？── 是 → 追问澄清（最多 2 轮）
      │                         └── 仍不足 → 默认升级为 SEE_DOCTOR
      ▼
┌──────────────────┐
│ 规则引擎匹配      │ ── 按优先级：E* > D* > H*
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ safety_gate 审查  │ ── 最终否决权
│  - 月龄 < 3？     │     任何可疑 → 升级
│  - 多条规则冲突？  │     取最高级
│  - 免责声明附加    │
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ 输出分诊结果      │
│ + LLM 生成话术    │ ── 温暖、清晰、可操作
│ + 免责声明        │ ── "本建议不替代医生诊断"
│ + 随访任务创建    │ ── follow_up_task
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ workflow_run 记录 │ ── 完整审计日志
└──────────────────┘
```

---

## 6 字段与接口（D1 Schema 对齐）

> 说明：D1 已定义 `vaccine_event`、`symptom_event`、`reminder`、`follow_up_task`、`workflow_run` 基础结构；本节中的新增字段为 **建议增量字段**，用于支撑 C2 规则落地，不应被理解为 D1 已全部具备。


### 6.1 `vaccine_event` 扩展字段

```typescript
interface VaccineEvent {
  id: string;
  baby_id: string;
  vaccine_code: string;          // e.g., "HepB", "BCG", "DTaP"
  dose_number: number;           // 第几剂
  schedule_region: "CN" | "US" | "WHO_DEFAULT";
  status: VaccineStatus;         // SCHEDULED | REMINDED | GIVEN | OVERDUE | DEFERRED | CONTRAINDICATED | SKIPPED_BY_PARENT
  scheduled_date: Date;          // 计划接种日
  reminder_dates: Date[];        // 提醒日期列表
  administered_at?: Date;        // 实际接种时间
  administered_by?: string;      // 接种机构
  batch_number?: string;         // 疫苗批号
  defer_reason?: string;         // 延期原因
  defer_until?: Date;            // 延期至
  contraindication?: string;     // 禁忌症描述
  skip_reason?: string;          // 家长跳过原因
  catch_up_from?: string;        // 补种来源（关联原 event id）
  created_at: Date;
  updated_at: Date;
}
```

### 6.2 `symptom_event` 扩展字段

```typescript
interface SymptomEvent {
  id: string;
  baby_id: string;
  reported_at: Date;
  reporter: "parent" | "caregiver";
  
  // NLU 解析结果
  raw_text: string;              // 家长原始描述
  parsed_symptoms: string[];     // 结构化症状代码列表
  nlu_confidence: number;        // 解析置信度 0-1
  
  // 生命体征（如有）
  temperature?: number;          // 体温 °C
  respiratory_rate?: number;     // 呼吸频率
  heart_rate?: number;           // 心率（如有）
  
  // 分诊上下文
  duration_hours?: number;       // 症状持续时间
  stool_count_24h?: number;      // 24h 大便次数
  feeding_refusal_hours?: number; // 拒食时长
  dehydration_signs?: number;    // 脱水征象计数
  post_vaccination_hours?: number; // 距上次接种小时数
  
  // 分诊结果
  triage_level: "HOME_CARE" | "SEE_DOCTOR" | "EMERGENCY_120";
  matched_rules: string[];       // 命中的规则 ID 列表
  safety_gate_override?: boolean; // safety_gate 是否介入
  
  // 关联
  related_vaccine_event_id?: string;  // 如与接种相关
  workflow_run_id: string;       // 关联的工作流执行记录
}
```

### 6.3 `reminder` 表

```typescript
interface Reminder {
  id: string;
  baby_id: string;
  type: "VACCINE_PRE" | "VACCINE_OVERDUE" | "SYMPTOM_FOLLOWUP" | "ADVERSE_REACTION_CHECK";
  related_event_id: string;      // 关联 vaccine_event 或 symptom_event
  scheduled_at: Date;
  sent_at?: Date;
  channel: "push" | "in_app" | "sms";
  status: "PENDING" | "SENT" | "ACKNOWLEDGED" | "DISMISSED";
}
```

### 6.4 `follow_up_task` 表

```typescript
interface FollowUpTask {
  id: string;
  baby_id: string;
  type: "POST_VACCINE_CHECK" | "SYMPTOM_RECHECK" | "OVERDUE_VACCINE_NUDGE";
  source_event_id: string;
  created_at: Date;
  scheduled_at: Date;
  completed_at?: Date;
  closed_at?: Date;
  outcome?: "RESOLVED" | "ESCALATED" | "NO_RESPONSE";
}
```

### 6.5 `workflow_run` 表

```typescript
interface WorkflowRun {
  id: string;
  baby_id: string;
  workflow_type: "VACCINE_SCHEDULE" | "TRIAGE" | "ADVERSE_REACTION" | "CATCH_UP";
  triggered_by: string;          // event id 或 "system"
  started_at: Date;
  completed_at?: Date;
  steps: WorkflowStep[];         // 每步的输入/输出记录
  final_output: object;          // 最终结果
  audit_log: AuditEntry[];       // 完整审计日志
}
```

### 6.6 对 E1 / G1 的接口约束

| 接口域 | 约束 | 用途 |
|------|------|------|
| E1-GOLD-TRIAGE-01 | `<3月龄发热≥38°C`、呼吸困难、抽搐、意识改变、严重过敏等 P0 场景必须 `RULE_ONLY` 判定，禁止 LLM 作为主裁判 | 保证高风险分诊 100% 可回放、可断言 |
| E1-GOLD-VAX-02 | 疫苗提醒、逾期、补种、延期、禁忌筛查必须验证 `vaccine_event/reminder/follow_up_task/workflow_run` 的状态迁移是否一致 | 防止提醒发出但状态未落库 |
| E1-GOLD-AE-03 | 接种后不良反应至少覆盖轻微反应 / 持续高热 / 疑似过敏性休克三档 case | 验证居家观察、尽快就医、急诊升级链路 |
| G1-MVP-01 | MVP 只强制落地：中国默认 schedule、P0 分诊规则、基础提醒与接种后随访，不在 MVP 硬做全部国家/省份细表 | 控制首版范围 |
| G1-MVP-02 | 上线前必须完成：医学顾问复核规则包、法务复核免责声明、E1 金集回归通过 | 作为 release gate |
| G1-POST-03 | 美国/WHO 扩展、二类疫苗推荐、省级差异配置放在 MVP 后迭代 | 避免首版范围失控 |


---

## 7 Deterministic Rules vs LLM 分工矩阵

| 功能 | 规则引擎（确定性） | LLM | safety_gate |
|------|-------------------|-----|-------------|
| 疫苗调度计算 | ✅ 唯一决策者 | ❌ | 审计 |
| 疫苗提醒时机 | ✅ | ❌ | — |
| 禁忌症筛查流程 | ✅ 判定逻辑 | 问题话术生成 | 审计 |
| 补种窗口判定 | ✅ | ❌ | 审计 |
| 症状文本 → 结构化 | ❌ | ✅ NLU 解析 | 置信度门控 |
| 分诊定级 | ✅ 唯一决策者 | ❌ | **最终否决权** |
| 护理指导话术 | 模板选择 | ✅ 个性化润色 | 内容审查 |
| 急救提示 | ✅ 固定文案，不可 LLM 改写 | ❌ | ✅ 锁定 |
| 追问澄清 | 缺失字段检测 | ✅ 话术生成 | 轮次上限 |
| 免责声明 | ✅ 固定文案，每次附加 | ❌ 不可省略/改写 | ✅ 强制 |

### 7.1 safety_gate 机制

```python
class SafetyGate:
    """最终否决权，运行在规则引擎输出之后、用户响应之前"""
    
    def review(self, triage_result, symptom_event, baby_profile):
        # 1. 月龄兜底：< 3 月龄任何异常 → 升级
        if baby_profile.age_months < 3 and triage_result.level != "EMERGENCY_120":
            if symptom_event.has_any_abnormality():
                return self.escalate(triage_result, "EMERGENCY_120", 
                    reason="小月龄兜底规则")
        
        # 2. 多规则冲突：取最高级
        if len(triage_result.matched_rules) > 1:
            max_level = max(r.level for r in triage_result.matched_rules)
            if max_level > triage_result.level:
                return self.escalate(triage_result, max_level,
                    reason="多规则冲突取最高")
        
        # 3. NLU 低置信度：升级
        if symptom_event.nlu_confidence < 0.7:
            return self.escalate(triage_result, 
                max(triage_result.level, "SEE_DOCTOR"),
                reason="NLU 置信度不足")
        
        # 4. 强制附加免责声明
        triage_result.disclaimer = MANDATORY_DISCLAIMER
        
        return triage_result
```

---

## 8 Trade-off 分析

### 8.1 规则粒度 vs 维护成本

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| **粗粒度规则**（~30 条） | 易维护、易测试 | 可能漏覆盖边缘场景 | — |
| **细粒度规则**（~200 条） | 覆盖全面 | 维护成本高、规则冲突风险大 | — |
| **分层规则**（核心 ~50 + 扩展包） | 平衡覆盖与维护 | 需要良好的分层架构 | ✅ **推荐** |

### 8.2 硬编码 vs 配置化

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 硬编码在代码中 | 简单直接 | 更新需发版 | ❌ |
| JSON/YAML 配置文件 | 可热更新、易审查 | 需要配置管理基础设施 | ✅ **推荐** |
| 数据库存储 | 最灵活 | 版本控制和审计复杂 | 后期可选 |

### 8.3 LLM 参与度

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| LLM 全权处理分诊 | 最自然的交互 | 不可审计、有幻觉风险、安全不可控 | ❌ **严禁** |
| 纯规则无 LLM | 最安全 | 用户体验差、无法理解自然语言 | ❌ |
| 规则引擎 + LLM 辅助 | 安全可控 + 自然交互 | 架构复杂度中等 | ✅ **推荐** |

### 8.4 地区方案管理

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 单一全球方案 | 简单 | 无法适应各国差异 | ❌ |
| 每地区独立代码分支 | 完全隔离 | 维护成本 N 倍 | ❌ |
| 共享引擎 + 地区配置包 | 复用逻辑、差异化数据 | 需要良好的配置抽象 | ✅ **推荐** |

---

## 9 推荐结论

1. **采用确定性规则引擎**作为疫苗调度和分诊定级的唯一决策层，LLM 限定为 NLU 解析和话术生成。
2. **三级分诊模型**（HOME_CARE / SEE_DOCTOR / EMERGENCY_120），高风险默认急救，不可降级。
3. **safety_gate 拥有最终否决权**，可升级但不可降级分诊结果。
4. **疫苗规则配置化**，以 JSON/YAML 文件管理，支持 `schedule_region` 路由，CN 为默认。
5. **接种后不良反应随访**作为标准工作流，自动创建 `follow_up_task`。
6. **所有分诊结果附加免责声明**，急救提示使用固定文案，不经 LLM 改写。
7. **疫苗细目、补种规则、禁忌清单**标注"待人工复核"，每季度/每年校验。
8. **分层规则架构**：核心规则（~50 条）+ 地区扩展包，平衡覆盖度与可维护性。

---

## 10 不推荐做法

| 做法 | 原因 | 风险等级 |
|------|------|----------|
| 让 LLM 直接判定分诊级别 | 不可审计、有幻觉风险 | 🔴 严禁 |
| 让 LLM 生成或修改急救提示文案 | 错误信息可能延误急救 | 🔴 严禁 |
| 硬编码疫苗日期/间隔在业务逻辑中 | 政策更新无法快速响应 | 🟡 不推荐 |
| 省略免责声明 | 法律和伦理风险 | 🔴 严禁 |
| 对小月龄（<3月）宝宝给出"居家观察"建议 | 小月龄感染风险极高 | 🔴 严禁 |
| 在分诊流程中追问超过 2 轮 | 延误可能的紧急情况 | 🟡 不推荐 |
| 提供具体药物剂量建议 | 超出产品边界，属于诊断行为 | 🔴 严禁 |
| 对家长使用恐吓性话术 | 违背产品价值观，制造不必要焦虑 | 🟡 不推荐 |
| 跳过 safety_gate 直接输出 | 失去最终安全屏障 | 🔴 严禁 |
| 用单一全球疫苗方案覆盖所有地区 | 各国差异大，可能导致错误建议 | 🟡 不推荐 |

---

## 11 待人工复核项

以下条目在系统实现时**不可直接硬编码**，必须经过人工审定并建立定期复核机制：

| 编号 | 复核项 | 复核频率 | 复核人 | 说明 |
|------|--------|----------|--------|------|
| R01 | 中国 NIP 疫苗种类与时间表 | 每年 + 政策更新时 | 医学顾问 + 产品 | 需对照最新版《国家免疫规划疫苗儿童免疫程序说明》 |
| R02 | 各省份地方差异（schedule_variant） | 每年 | 医学顾问 | 部分省份有提前或延后安排 |
| R03 | 补种最小间隔与最大年龄限制 | 每年 | 医学顾问 | 不同疫苗差异极大 |
| R04 | 各疫苗禁忌症清单 | 每年 + 药品说明书更新时 | 医学顾问 | 需逐疫苗核实 |
| R05 | 美国 CDC ACIP 推荐方案 | 每年 2 月 | 医学顾问 | CDC 年度更新 |
| R06 | WHO EPI 方案 | 每年 | 医学顾问 | 作为 fallback |
| R07 | 二类疫苗推荐列表与话术 | 每半年 | 医学顾问 + 法务 | 涉及广告/推荐合规 |
| R08 | 分诊规则阈值（体温、时长等） | 每年 | 医学顾问 | 需与最新指南对齐 |
| R09 | 急救提示固定文案 | 每半年 | 医学顾问 + 法务 | 确保准确性和法律合规 |
| R10 | 免责声明文案 | 每年 + 法规变化时 | 法务 | 需满足各运营地区法律要求 |
| R11 | 小月龄定义阈值（当前 3 月龄） | 每年 | 医学顾问 | 不同指南定义略有差异 |
| R12 | 脱水征象评估标准 | 每年 | 医学顾问 | 需与 WHO 脱水评估量表对齐 |

**复核流程**：
1. 系统在配置文件中标注每条规则的 `last_reviewed_date` 和 `next_review_date`。
2. 临近复核日期时自动向指定负责人发送提醒。
3. 复核结果记录在 `rule_review_log` 中，包括审核人、审核日期、变更内容。
4. 未通过复核的规则自动标记为 `NEEDS_REVIEW`，在 safety_gate 中触发保守处理（升级一档）。

---

## 12 实施阶段建议

### Phase 1：MVP（第 1-2 月）

| 目标 | 范围 | 交付物 |
|------|------|--------|
| 中国 NIP 一类疫苗提醒 | 12 种疫苗、基本提醒、逾期通知 | `vaccine_schedule_CN.json`、规则引擎 MVP、提醒服务 |
| 基础分诊（仅 L3） | ~10 条急诊规则 | `triage_rules_emergency.yaml`、safety_gate v1 |
| 接种后基础随访 | 30min / 24h 两次检查 | `follow_up_task` 基础流程 |

**Phase 1 不做**：补种计算、禁忌筛查、L1/L2 细分、美国/国际方案、二类疫苗。

### Phase 2：完善（第 3-4 月）

| 目标 | 范围 | 交付物 |
|------|------|--------|
| 三级分诊完整覆盖 | L1 + L2 + L3 共 ~50 条规则 | 完整规则集 |
| LLM NLU 集成 | 症状文本 → 结构化解析 | NLU pipeline、置信度门控 |
| 补种计算 | 逾期自动生成补种方案 | catch-up engine |
| 禁忌筛查 | 接种前问卷流程 | contraindication checker |
| 接种后完整随访 | 30min / 4h / 24h / 72h | 完整 follow-up workflow |

### Phase 3：扩展（第 5-6 月）

| 目标 | 范围 | 交付物 |
|------|------|--------|
| 美国 CDC 方案 | US region 全量覆盖 | `vaccine_schedule_US.json` |
| WHO fallback | 国际用户兜底 | `vaccine_schedule_WHO.json` |
| 二类疫苗推荐 | 自费疫苗信息提供（非强制） | 二类疫苗配置包 |
| 省级差异支持 | `schedule_variant` 机制 | 省级配置文件 |
| 规则热更新 | 不停服务更新规则 | 配置管理系统 |

### Phase 4：优化（持续）

| 目标 | 范围 |
|------|------|
| 规则覆盖度分析 | 基于真实用户数据识别规则盲区 |
| NLU 模型迭代 | 基于解析失败案例持续优化 |
| 定期人工复核 | R01-R12 定期执行 |
| A/B 测试话术 | 优化提醒和分诊话术的接受度 |

---

## 13 结论

疫苗规则与分诊规则是宝宝 agent 的安全基石。本文档确立了以下不可动摇的原则：

1. **确定性规则引擎是唯一的决策层**，LLM 不参与风险判定。
2. **safety_gate 拥有最终否决权**，任何不确定性都导致分诊升级。
3. **产品不是诊断工具**——我们帮助家长识别紧急程度、提供及时提醒，但所有建议都以"请咨询医生"为底线。
4. **高风险一律默认就医/急救**——宁可过度谨慎，绝不冒险遗漏。
5. **快速变化的医学/政策信息不硬编码**——通过配置化管理和定期人工复核机制确保准确性。
6. **每一次分诊都有完整审计记录**——`workflow_run` 表记录全链路，可追溯、可复查。

> **免责声明模板**（每次分诊结果必须附加）：
> 
> "以上信息仅供参考，不构成医疗诊断或治疗建议。如宝宝出现任何异常，请及时就医。紧急情况请立即拨打 120。"

---

*文档状态：`ready_for_review`*  
*下一步：医学顾问审阅规则清单 → 法务审阅免责声明 → 工程团队评审 Schema 兼容性*
