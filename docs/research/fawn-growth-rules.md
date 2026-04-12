# 05 - 生长标准与规则引擎设计

> **文档状态**: `ready_for_review`
> **任务 ID**: C1
> **前置依赖**: A1(框架), A2(架构), B1(知识库), B2(来源矩阵), D1(schema), E1(eval), F1(安全边界)
> **后续支撑**: C2(疫苗与分诊规则，可复用生长规则设计模式), G1(MVP roadmap)

---

## 1. 执行摘要

本文档为"宝宝专属 agent"定义**体格生长评估**的完整 deterministic rules 设计，覆盖：

- WHO / CDC / 中国（WS/T 423 等）三套生长标准的适用范围、差异与推荐默认方案
- percentile、z-score、corrected age（早产儿校正月龄）的精确计算规则
- growth_event 字段设计与 DB schema / Temporal reminder / eval harness 的接口约束
- 异常阈值四级分级体系
- deterministic rules 与 LLM 的严格分工边界

**核心设计原则**：

| 原则 | 说明 |
|------|------|
| 规则优先 | 所有数值计算、阈值判定、标准选择路由由 deterministic code 执行，LLM 不参与 |
| 保守医疗边界 | 产品不是诊断工具；高风险异常一律建议儿保/儿科复核 |
| 标注不确定性 | 对中国标准细项、地方儿保口径差异显式标注"待人工复核" |
| 可测试 | 每条规则可直接生成 eval case，支撑 E1 要求的 deterministic eval |

---

## 2. 为什么生长评估必须是 Deterministic Rules

### 2.1 不能交给 LLM 的原因

```
┌─────────────────────────────────────────────────────────────┐
│  家长输入: "宝宝 6个月, 7.2kg, 66cm, 头围 42.5cm"           │
│                                                             │
│  ┌──────────────┐     ┌──────────────────┐                  │
│  │ LLM 处理？   │ ──> │ ❌ 不可接受       │                  │
│  │              │     │ - 幻觉风险        │                  │
│  │              │     │ - 计算不精确      │                  │
│  │              │     │ - 不可复现        │                  │
│  │              │     │ - 无法审计        │                  │
│  └──────────────┘     └──────────────────┘                  │
│                                                             │
│  ┌──────────────┐     ┌──────────────────┐                  │
│  │ Rule Engine  │ ──> │ ✅ 必须这样做     │                  │
│  │              │     │ - 精确查表/插值   │                  │
│  │              │     │ - 100% 可复现     │                  │
│  │              │     │ - 可审计可追溯    │                  │
│  │              │     │ - 可 eval 断言    │                  │
│  └──────────────┘     └──────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 LLM 的正确角色

LLM **只做**以下事项：
1. **意图识别**：理解家长输入的是生长记录
2. **参数提取**：从自然语言中提取 weight_kg / height_cm / head_circ_cm 等字段
3. **结果解释**：将规则引擎返回的结构化结果转为家长可读的文字
4. **情感关怀**：对焦虑家长给予适当安抚（但不改变医疗结论）

LLM **绝不做**：
- z-score / percentile 计算
- 阈值判定
- 标准选择
- 趋势分析结论
- 任何形式的诊断暗示

---

## 3. WHO / CDC / 中国标准对比

### 3.1 三套标准概览

| 维度 | WHO Child Growth Standards | CDC Growth Charts | 中国标准 (WS/T 423 等) |
|------|---------------------------|-------------------|----------------------|
| **发布机构** | WHO (2006/2007) | US CDC (2000) | 国家卫健委 |
| **数据来源** | 6国纵向+横断面研究（巴西/加纳/印度/挪威/阿曼/美国）| 美国全国调查数据 | 中国儿童体格发育调查 |
| **设计理念** | Prescriptive（应该怎么长）| Descriptive（实际怎么长）| Descriptive（中国儿童实际生长） |
| **0-2岁** | ✅ 金标准 | ⚠️ CDC 自己推荐用 WHO | ✅ 有对应标准 |
| **2-5岁** | ✅ 覆盖 | ✅ 覆盖 | ✅ 覆盖 |
| **5-18/20岁** | WHO 2007 Reference（非 Standards）| ✅ 覆盖到20岁 | ✅ 覆盖到18岁 |
| **BMI** | 有（0-5岁）| 有（2-20岁）| 有 |
| **头围** | 有（0-5岁）| 有（0-36月）| 有 |
| **数据可获取性** | 公开 LMS 表可下载 | 公开 LMS 表可下载 | ⚠️ 需从标准文本提取；**待人工复核** |
| **许可** | 公开使用 | 公开使用 | 行业标准公开发布；具体软件嵌入许可 **待人工复核** |
| **母乳喂养权重** | 以纯母乳喂养为基准 | 混合喂养 | **待人工复核**（需确认数据采集口径） |

### 3.2 关键差异与 Trade-off

**WHO vs CDC (0-2岁)**:
- WHO 标准基于母乳喂养儿童，CDC 混合了配方奶喂养
- 影响：在 3-6 月区间，WHO 标准下体重增速更快；6-12 月 WHO 标准下体重增速相对 CDC 稍慢
- 实际结果：用 CDC 标准评估纯母乳喂养宝宝，可能在 6-12 月产生"偏瘦"的假阳性

**中国标准 vs WHO**:
- 中国儿童体格与 WHO 多国样本存在差异（尤其身长/身高）
- 中国各地儿保实际使用标准不统一：部分用 WHO，部分用国标
- ⚠️ **待人工复核**：2023 年后是否有新版标准发布；各省儿保信息系统实际用哪套标准

### 3.3 推荐默认方案

```
推荐策略: "WHO 为默认，中国标准为可选补充"

理由:
1. WHO 0-5岁标准通常可作为国际默认基线；中国场景如需与本地儿保口径完全对齐，应提供中国标准切换并保留人工复核
2. WHO 数据表公开、格式统一、LMS 参数可直接下载
3. 中国标准作为本地化补充，允许家长/医生切换
4. 降低维护复杂度：优先保证一套标准 100% 正确
```

**具体推荐**:

| 场景 | 推荐标准 | 备注 |
|------|---------|------|
| 0-24月（默认） | WHO 2006 | 全球金标准 |
| 2-5岁（默认） | WHO 2006 | 延续性 |
| 5-18岁（默认） | WHO 2007 Reference | 或切换 CDC/中国 |
| 中国用户可选 | 中国 WS/T 423 | 需完成数据表数字化；**待人工复核** |
| 美国用户可选 | CDC 2000 | 2岁以上可切换 |
| 早产儿 0-corrected 50周 | Fenton 2013 (推荐) 或 INTERGROWTH-21st | 见 §5.3 |

**不推荐做法**:
- ❌ 不要在同一宝宝的同一时间段混用多套标准做比较
- ❌ 不要自行"融合"不同标准的 LMS 参数
- ❌ 不要用 5 岁以上的 WHO 2007 Reference 去评估 0-5 岁儿童

---

## 4. 标准选择路由

### 4.1 路由规则

```
输入:
  - baby.birth_country: str
  - baby.current_country: str (可选)
  - baby.gestational_weeks: int
  - baby.birth_date: date
  - measurement.date: date
  - family.preferred_standard: str | null  (家长/医生主动选择)
  - baby.is_preterm: bool  (gestational_weeks < 37)

路由逻辑 (伪代码):

function select_standard(baby, measurement):
    age_days = measurement.date - baby.birth_date

    # 0. 家长/医生显式选择 → 尊重选择
    if family.preferred_standard is not null:
        return family.preferred_standard
        # 但如果选择与年龄段不兼容，返回 warning

    # 1. 早产儿且 corrected_age < 校正适用期
    if baby.is_preterm and needs_preterm_chart(baby, measurement):
        return "FENTON_2013"  # 或 INTERGROWTH-21st

    # 2. 默认路由
    if age_days <= 1856:  # 约 0-5岁 (5*365.25)
        return "WHO_2006"
    elif age_days <= 6570:  # 约 5-18岁
        return "WHO_2007_REF"
    else:
        return "NOT_APPLICABLE"  # 超出儿童生长标准范围
```

### 4.2 标准版本管理

```yaml
standard_registry:
  WHO_2006:
    version: "2006-04"
    age_range: "0-1856 days (0-60 months)"
    metrics: [weight_for_age, length_for_age, weight_for_length,
              bmi_for_age, head_circ_for_age]
    data_format: "LMS"
    source_url: "https://www.who.int/tools/child-growth-standards/standards"
    last_verified: "2024-01-15"  # 待更新

  WHO_2007_REF:
    version: "2007-01"
    age_range: "1826-6935 days (61-228 months)"
    metrics: [weight_for_age, height_for_age, bmi_for_age]
    data_format: "LMS"
    source_url: "https://www.who.int/tools/growth-reference-data-for-5to19-years"
    last_verified: "2024-01-15"  # 待更新

  CDC_2000:
    version: "2000-05-30"
    age_range: "0-7305 days (0-240 months)"
    metrics: [weight_for_age, length_for_age, stature_for_age,
              weight_for_length, weight_for_stature, bmi_for_age,
              head_circ_for_age]
    data_format: "LMS"
    source_url: "https://www.cdc.gov/growthcharts/"
    last_verified: "2024-01-15"  # 待更新

  CN_WST423:
    version: "WS/T 423-2013"  # ⚠️ 待人工复核：是否有更新版本
    age_range: "0-2555 days (0-84 months, 7岁以下)"
    metrics: [weight_for_age, height_for_age, bmi_for_age, head_circ_for_age]
    data_format: "待确认"  # ⚠️ 待人工复核：需从标准文本提取 LMS 或 percentile 表
    status: "PENDING_DIGITIZATION"

  FENTON_2013:
    version: "2013"
    age_range: "22-50 gestational weeks"
    metrics: [weight, length, head_circ]
    data_format: "LMS"
    note: "早产儿专用，50周后衔接 WHO"
```

---

## 5. Percentile / Z-score / Corrected Age 规则定义

### 5.1 Z-score 计算 (LMS 方法)

WHO 和 CDC 均使用 **LMS (Lambda-Mu-Sigma)** 方法：

```
参数:
  L = Box-Cox power (偏度校正)
  M = Median (中位数)
  S = Coefficient of variation (变异系数)

公式:
  当 L ≠ 0:
    z = [ (X/M)^L - 1 ] / (L × S)

  当 L = 0:
    z = ln(X/M) / S

其中 X = 实际测量值

极端值修正 (WHO 推荐):
  当 |z| > 3 时，使用 restricted application:
    SD3pos = M × (1 + L × S × 3)^(1/L)
    SD3neg = M × (1 + L × S × (-3))^(1/L)
    SD23pos = SD3pos - M × (1 + L × S × 2)^(1/L)
    SD23neg = M × (1 + L × S × (-2))^(1/L) - SD3neg

    if z > 3:  z_final = 3 + (X - SD3pos) / SD23pos
    if z < -3: z_final = -3 + (X - SD3neg) / SD23neg
```

### 5.2 Percentile 计算

```
percentile = Φ(z) × 100

其中 Φ 是标准正态分布的 CDF。

常用对照:
  z = -3   → P0.13
  z = -2   → P2.28
  z = -1   → P15.87
  z = 0    → P50
  z = +1   → P84.13
  z = +2   → P97.72
  z = +3   → P99.87

展示精度: 保留 1 位小数 (如 P15.9)
存储精度: float64，保留原始值
```

### 5.3 Corrected Age (早产儿校正月龄)

```
定义:
  corrected_age = chronological_age - (40 - gestational_weeks_at_birth)

规则:
  1. 适用条件: gestational_weeks < 37
  2. 校正期限 (⚠️ 以下为通用共识；具体执行需确认当地儿保口径):
     - 体重: 校正至 24 月龄
     - 身长/身高: 校正至 24 月龄 (部分指南建议至 36 月龄)
     - 头围: 校正至 18 月龄
     - 发育里程碑: 校正至 24 月龄
  3. 极早产 (<28周): 部分专家建议校正至 36 月龄 —— **待人工复核**
  4. 校正后如仍异常，按异常阈值处理

计算示例:
  出生孕周 = 32 周
  当前日历年龄 = 6 月 (180 天)
  校正天数 = (40 - 32) × 7 = 56 天
  校正后年龄 = 180 - 56 = 124 天 ≈ 4 月 4 天
  → 用 4 月 4 天的 LMS 参数进行查表

伪代码:
function calc_corrected_age(baby, measurement_date):
    chrono_days = measurement_date - baby.birth_date
    if baby.gestational_weeks >= 37:
        return chrono_days  # 足月儿不校正
    correction_days = (40 - baby.gestational_weeks) * 7
    corrected = chrono_days - correction_days
    return max(corrected, 0)  # 不允许负数

function should_use_corrected_age(baby, measurement_date, metric):
    chrono_days = measurement_date - baby.birth_date
    limits = {
        "weight":    730,  # 24 月
        "height":    730,  # 24 月 (保守; 部分指南36月)
        "head_circ": 548,  # 18 月
    }
    if baby.gestational_weeks >= 37:
        return False
    return chrono_days <= limits.get(metric, 730)
```

### 5.4 年龄精确计算

```
规则:
  1. 年龄以"天"为内部单位，不用"月"（避免月份天数不同导致的精度问题）
  2. age_days = measurement_date - birth_date
  3. 查 LMS 表时:
     - WHO 表按月提供 (0, 1, 2, ... 60 月)
     - 需要在两个月龄点之间做线性插值
     - 插值公式: LMS_interp = LMS_lower + (LMS_upper - LMS_lower)
                               × (age_days - lower_days) / (upper_days - lower_days)
  4. WHO 0-13 周有按周甚至按天的数据，优先用精细表
  5. 2 岁以下用 "length"（卧位），2 岁及以上用 "height"（站位）
     - 如果 < 2岁但站着量了，测量值 +0.7cm 转换为卧位值
     - 如果 ≥ 2岁但躺着量了，测量值 -0.7cm 转换为站位值
     - ⚠️ 此 0.7cm 修正来自 WHO 文档，**待人工复核**是否中国标准也采用此值
```

### 5.5 LMS 查表与插值流程

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ 输入:        │    │ 标准选择路由  │    │ LMS 表查询   │
│ age_days     │───>│ select_      │───>│ 按年龄插值   │
│ sex          │    │ standard()   │    │ 取 L, M, S   │
│ metric       │    └──────────────┘    └──────┬───────┘
│ value        │                               │
└──────────────┘                               ▼
                                       ┌──────────────┐
                                       │ Z-score 计算  │
                                       │ (LMS公式)     │
                                       └──────┬───────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │ Percentile   │
                                       │ = Φ(z) × 100 │
                                       └──────┬───────┘
                                              │
                                              ▼
                                       ┌──────────────┐
                                       │ 阈值分级判定  │
                                       │ (见 §7)      │
                                       └──────────────┘
```

---

## 6. growth_event 字段设计与接口约束

### 6.1 字段定义 (对齐 D1 schema)

> **Schema 收敛说明**：本节字段定义是 `growth_event` 的上游领域模型，D1 已被同步扩展以承接这些字段。后续若再新增字段，应先修改 D1 作为 schema source of truth，再回写本节，避免 C1/D1 漂移。

```sql
-- growth_event 子表 (继承 timeline_event 的 event_id, baby_id, timestamp 等)
CREATE TABLE growth_event (
    event_id            UUID PRIMARY KEY REFERENCES timeline_event(event_id),

    -- 原始测量值
    weight_kg           DECIMAL(5,3),     -- 精度到克, 如 7.250
    height_cm           DECIMAL(5,2),     -- 精度到 0.1cm, 如 66.50
    head_circ_cm        DECIMAL(5,2),     -- 精度到 0.1cm
    measurement_position VARCHAR(10),      -- 'supine' | 'standing' | 'unknown'

    -- 校正年龄 (由 rule engine 计算填入)
    chronological_age_days  INT NOT NULL,
    corrected_age_days      INT,           -- NULL 表示足月儿或超出校正期
    age_used_days           INT NOT NULL,  -- 实际用于查表的年龄

    -- 标准与计算结果 (由 rule engine 计算填入)
    standard_source     VARCHAR(20) NOT NULL,  -- 'WHO_2006' | 'WHO_2007_REF' | 'CDC_2000' | 'CN_WST423' | 'FENTON_2013'
    standard_version    VARCHAR(20),

    weight_zscore       DECIMAL(5,2),
    height_zscore       DECIMAL(5,2),
    head_circ_zscore    DECIMAL(5,2),
    weight_percentile   DECIMAL(5,1),
    height_percentile   DECIMAL(5,1),
    head_circ_percentile DECIMAL(5,1),

    -- BMI (2岁以上计算)
    bmi                 DECIMAL(4,1),
    bmi_zscore          DECIMAL(5,2),
    bmi_percentile      DECIMAL(5,1),

    -- weight-for-length/height
    wfl_zscore          DECIMAL(5,2),     -- weight-for-length z-score
    wfl_percentile      DECIMAL(5,1),

    -- 阈值判定结果 (由 rule engine 填入)
    alert_level         VARCHAR(10),       -- 'NORMAL' | 'WATCH' | 'REVIEW' | 'URGENT'
    alert_details       JSONB,             -- 具体哪些指标触发了什么级别
    is_outlier          BOOLEAN DEFAULT FALSE,

    -- 趋势标记 (由 rule engine 基于历史数据填入)
    trend_flag          VARCHAR(20),       -- 'STABLE' | 'CROSSING_UP' | 'CROSSING_DOWN' | 'RAPID_CHANGE' | 'INSUFFICIENT_DATA'
    trend_details       JSONB,

    -- 元数据
    measured_by         VARCHAR(50),       -- 'parent' | 'clinic' | 'hospital'
    measurement_note    TEXT,
    engine_version      VARCHAR(20),       -- rule engine 版本号
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.2 percentile_json 格式 (存入 alert_details)

```json
{
  "weight": {
    "value_kg": 7.25,
    "zscore": -0.53,
    "percentile": 29.8,
    "alert": "NORMAL"
  },
  "height": {
    "value_cm": 66.5,
    "zscore": -0.12,
    "percentile": 45.2,
    "alert": "NORMAL"
  },
  "head_circ": {
    "value_cm": 42.5,
    "zscore": 0.31,
    "percentile": 62.2,
    "alert": "NORMAL"
  },
  "wfl": {
    "zscore": -0.78,
    "percentile": 21.8,
    "alert": "NORMAL"
  },
  "meta": {
    "standard": "WHO_2006",
    "age_used_days": 124,
    "corrected": true,
    "engine_version": "1.2.0"
  }
}
```

### 6.3 输入验证规则

```yaml
input_validation:
  weight_kg:
    min: 0.3     # 极低出生体重
    max: 80.0    # 合理上限 (大龄儿童)
    required_precision: 3  # 小数位
    reject_if_delta_gt: 5.0  # 与上次记录差值超过 5kg 需确认

  height_cm:
    min: 20.0    # 极早产儿
    max: 200.0
    required_precision: 1
    reject_if_delta_gt: 10.0  # 与上次差值超过 10cm 需确认
    reject_if_decrease_gt: 2.0  # 身高不应显著减少

  head_circ_cm:
    min: 20.0
    max: 60.0
    required_precision: 1
    reject_if_delta_gt: 5.0

  age_days:
    min: 0
    max: 6570    # 18岁

  # 错误输入拦截
  common_errors:
    - type: "unit_confusion"
      detect: "weight_kg > 30 AND age_days < 365"
      message: "体重值异常，请确认单位是否为 kg（而非 g）"
    - type: "unit_confusion"
      detect: "height_cm < 30 AND age_days > 90"
      message: "身高值异常，请确认单位是否为 cm（而非 inch）"
    - type: "swap_detection"
      detect: "weight_kg > height_cm"
      message: "体重和身高数值可能填反了，请确认"
    - type: "stale_data"
      detect: "measurement_date > today + 1day"
      message: "测量日期在未来，请确认"
```

---

## 7. 阈值分级体系

### 7.1 四级告警

```
┌─────────┬───────────────┬─────────────────────────────────┬──────────────────────┐
│ 级别    │ 触发条件       │ 含义                            │ 产品行为             │
├─────────┼───────────────┼─────────────────────────────────┼──────────────────────┤
│ NORMAL  │ -2 < z < +2   │ 正常范围                        │ 正常展示曲线         │
│         │               │ (P2.3 ~ P97.7)                  │                      │
├─────────┼───────────────┼─────────────────────────────────┼──────────────────────┤
│ WATCH   │ -3 < z ≤ -2   │ 偏低/偏高，需持续观察           │ 黄色提示 + 建议      │
│         │ 或 +2 ≤ z < +3│                                 │ 下次测量提前         │
│         │ 或趋势穿越 1   │                                 │ Temporal 设置        │
│         │ 条主百分位线   │                                 │ 2周后 follow-up      │
├─────────┼───────────────┼─────────────────────────────────┼──────────────────────┤
│ REVIEW  │ z ≤ -3        │ 显著异常，建议尽快儿保复核       │ 橙色警示 +           │
│         │ 或 z ≥ +3     │                                 │ "建议预约儿保"       │
│         │ 或趋势穿越 2   │                                 │ Temporal 设置        │
│         │ 条主百分位线   │                                 │ 1周后 follow-up      │
│         │               │                                 │ (如未标记已就诊)     │
├─────────┼───────────────┼─────────────────────────────────┼──────────────────────┤
│ URGENT  │ z ≤ -4        │ 严重异常，建议尽快儿科评估       │ 红色警示 +           │
│         │ 或 z ≥ +4     │                                 │ "建议尽快就医"       │
│         │ 或体重下降     │                                 │ Temporal 设置        │
│         │ 超过 2 个      │                                 │ 3天后 follow-up      │
│         │ z-score 单位   │                                 │ safety_gate 介入     │
│         │ (短期内)       │                                 │                      │
└─────────┴───────────────┴─────────────────────────────────┴──────────────────────┘
```

### 7.2 趋势告警规则

```yaml
trend_rules:
  # 至少需要 2 个数据点才能计算趋势
  minimum_data_points: 2

  # 百分位线穿越
  percentile_crossing:
    major_lines: [3, 10, 25, 50, 75, 90, 97]  # 主百分位线
    # 穿越 = 连续两次测量跨过了百分位线
    crossing_1_line:
      alert: "WATCH"
      note: "生长曲线穿越了 1 条主百分位线"
    crossing_2_lines:
      alert: "REVIEW"
      note: "生长曲线穿越了 2 条主百分位线，建议儿保复核"

  # Z-score 变化速率
  zscore_velocity:
    # 短期内（<= 30天）z-score 变化
    rapid_decline:
      threshold: -1.0  # z-score 下降 > 1.0
      period_days: 30
      alert: "REVIEW"
    extreme_decline:
      threshold: -2.0
      period_days: 90
      alert: "URGENT"

  # 体重特殊规则
  weight_specific:
    # 体重绝对下降（非新生儿期）
    weight_loss_after_14_days:
      condition: "age_days > 14 AND current_weight < previous_weight"
      alert: "REVIEW"
      note: "新生儿期后体重不应下降"

    # 新生儿期生理性体重下降
    newborn_weight_loss:
      condition: "age_days <= 14"
      acceptable_loss: 0.10  # 10% of birth weight
      alert_if_exceeds: "REVIEW"
      note: "新生儿生理性体重下降不应超过出生体重的 10%"

  # 头围特殊规则
  head_circ_specific:
    rapid_increase:
      threshold: 1.5  # z-score 上升 > 1.5
      period_days: 60
      alert: "REVIEW"
      note: "头围快速增大需排除颅内压增高等"
    stagnation:
      threshold: 0  # 60天内 z-score 无增长或下降
      period_days: 90
      alert: "WATCH"
```

### 7.3 各级别的输出约束

```yaml
output_constraints:
  NORMAL:
    show_percentile: true
    show_zscore: false  # 家长界面不展示 z-score（避免焦虑）
    suggestion: null
    temporal_followup: "按常规儿保间隔"

  WATCH:
    show_percentile: true
    show_zscore: false
    suggestion: "宝宝的 {metric} 处于偏{low/high}区间，建议持续关注。下次测量建议在 {date}。"
    temporal_followup: "14 天后提醒复测"
    llm_tone: "温和提醒，不制造焦虑"

  REVIEW:
    show_percentile: true
    show_zscore: false
    suggestion: "宝宝的 {metric} 需要关注，建议预约儿保/儿科医生评估。"
    temporal_followup: "7 天后提醒（如未标记已就诊）"
    llm_tone: "明确建议就医，但不恐吓"
    safety_gate: true  # safety_gate 标记此消息

  URGENT:
    show_percentile: true
    show_zscore: false  # 仍然不给家长看原始 z-score
    suggestion: "宝宝的 {metric} 存在明显异常，建议尽快带宝宝就医评估。"
    temporal_followup: "3 天后提醒（如未标记已就诊）"
    llm_tone: "紧急但不恐慌，给出行动建议"
    safety_gate: true
    escalation: true  # 触发额外通知（如有配置）
```

---

## 8. Deterministic Rules vs LLM 分工

### 8.1 分工矩阵

```
┌──────────────────────────────┬───────────────┬──────────┬────────────┐
│ 功能                         │ Deterministic │ LLM      │ 备注       │
│                              │ Rule Engine   │          │            │
├──────────────────────────────┼───────────────┼──────────┼────────────┤
│ 标准选择路由                  │ ✅            │          │            │
│ corrected age 计算            │ ✅            │          │            │
│ LMS 查表与插值                │ ✅            │          │            │
│ z-score 计算                  │ ✅            │          │            │
│ percentile 计算               │ ✅            │          │            │
│ 阈值分级判定                  │ ✅            │          │            │
│ 趋势穿越检测                  │ ✅            │          │            │
│ 输入验证/错误拦截             │ ✅            │          │            │
│ 体位修正 (±0.7cm)            │ ✅            │          │            │
│ Temporal 提醒调度触发         │ ✅            │          │            │
│ safety_gate 否决              │ ✅            │          │            │
├──────────────────────────────┼───────────────┼──────────┼────────────┤
│ 从自然语言提取测量值          │              │ ✅       │ 结构化后   │
│                              │              │          │ 交给规则   │
│ 向家长解释结果                │              │ ✅       │ 基于规则   │
│                              │              │          │ 引擎输出   │
│ 情感关怀/安抚                 │              │ ✅       │ 不改变     │
│                              │              │          │ 医疗结论   │
│ 回答开放问题                  │              │ ✅       │ "xx百分位  │
│ ("百分位是什么意思")          │              │          │ 意味着…"   │
│ 综合多次记录做叙事性总结      │              │ ✅       │ 基于规则   │
│                              │              │          │ 引擎趋势   │
├──────────────────────────────┼───────────────┼──────────┼────────────┤
│ ❌ 诊断                      │ 都不做        │ 都不做   │ 产品边界   │
│ ❌ 治疗建议                   │ 都不做        │ 都不做   │ 产品边界   │
│ ❌ 处方/用药                  │ 都不做        │ 都不做   │ 产品边界   │
└──────────────────────────────┴───────────────┴──────────┴────────────┘
```

### 8.2 交互流程

```
家长: "宝宝今天量了，7.2公斤，66厘米"

  ┌─────────┐
  │  LLM    │ 1. 意图识别: growth_record
  │         │ 2. 参数提取: weight=7.2kg, height=66cm
  │         │ 3. 补充确认: head_circ? measurement_position?
  └────┬────┘
       │ 结构化请求
       ▼
  ┌─────────────┐
  │ Rule Engine │ 4. select_standard → WHO_2006
  │             │ 5. calc_corrected_age → 124 days (如早产)
  │             │ 6. lookup_lms → L, M, S
  │             │ 7. calc_zscore → weight_z=-0.53, height_z=-0.12
  │             │ 8. calc_percentile → weight_p=29.8, height_p=45.2
  │             │ 9. check_threshold → NORMAL
  │             │ 10. check_trend → STABLE
  │             │ 11. write growth_event to DB
  └────┬────────┘
       │ 结构化结果
       ▼
  ┌─────────┐
  │  LLM    │ 12. 生成家长可读文本:
  │         │     "宝宝体重 7.2kg，在同龄宝宝中约第 30 百分位，
  │         │      身高 66cm，约第 45 百分位，都在正常范围内 👍"
  └────┬────┘
       │
       ▼
  ┌──────────────┐
  │ safety_gate  │ 13. 最终检查: LLM 输出是否与规则引擎结论一致
  │              │     - 如不一致 → 替换为安全模板文案
  │              │     - 如一致 → 放行
  └──────────────┘
```

### 8.3 safety_gate 对生长结果的检查规则

```yaml
safety_gate_growth_checks:
  - id: "sg_growth_01"
    name: "LLM不得降级告警"
    rule: "LLM 输出的文案不能将 REVIEW/URGENT 级别的结论表述为'正常'或'不用担心'"
    action: "替换为预设安全模板"

  - id: "sg_growth_02"
    name: "LLM不得编造数值"
    rule: "LLM 输出中如包含百分位或 z-score 数值，必须与规则引擎输出完全一致"
    action: "替换为预设安全模板"

  - id: "sg_growth_03"
    name: "LLM不得给出诊断"
    rule: "LLM 输出不得包含疾病名称作为结论（如'宝宝可能是矮小症'）"
    action: "删除诊断性语句，保留就医建议"

  - id: "sg_growth_04"
    name: "LLM不得建议用药或治疗"
    rule: "LLM 输出不得包含任何用药、治疗方案建议"
    action: "替换为'请咨询医生'"
```

---

## 9. Temporal Reminder / Follow-up / Eval Harness 接口

### 9.1 Temporal Workflow 接口

```yaml
# 生长评估完成后，Rule Engine 向 Temporal 发送的 signal

growth_followup_signal:
  workflow_id: "baby_{baby_id}_growth_followup"
  signal_name: "schedule_followup"
  payload:
    baby_id: UUID
    event_id: UUID
    alert_level: "NORMAL" | "WATCH" | "REVIEW" | "URGENT"
    followup_date: date
    followup_type: "routine_measurement" | "recheck_alert" | "verify_clinic_visit"
    message_template: str
    escalation_if_no_action: bool

# 常规儿保提醒间隔 (来自中国儿保要求 ⚠️ 待人工复核具体间隔)
routine_schedule:
  - age_range: "0-28 days"
    interval: "出院后 3-7 天"
  - age_range: "1-3 months"
    interval: "每月 1 次"
  - age_range: "4-6 months"
    interval: "每月 1 次"
  - age_range: "7-12 months"
    interval: "每 2 月 1 次"  # ⚠️ 部分地区每月
  - age_range: "13-24 months"
    interval: "每 3 月 1 次"
  - age_range: "25-36 months"
    interval: "每 6 月 1 次"
  - age_range: "37-72 months"
    interval: "每年 1 次"

# 异常级别覆盖常规间隔
alert_schedule_override:
  WATCH:  { interval_days: 14, max_reminders: 3 }
  REVIEW: { interval_days: 7,  max_reminders: 5 }
  URGENT: { interval_days: 3,  max_reminders: 7 }
```

### 9.2 Rule Engine API 接口

```typescript
// Rule Engine 对外暴露的接口

interface GrowthEvalRequest {
  baby_id: string;
  measurement_date: string;  // ISO 8601
  weight_kg?: number;
  height_cm?: number;
  head_circ_cm?: number;
  measurement_position?: 'supine' | 'standing' | 'unknown';
  measured_by?: string;
}

interface GrowthEvalResponse {
  event_id: string;
  standard_used: string;           // e.g. "WHO_2006"
  age_used_days: number;
  corrected: boolean;

  weight?: MetricResult;
  height?: MetricResult;
  head_circ?: MetricResult;
  bmi?: MetricResult;
  wfl?: MetricResult;

  alert_level: 'NORMAL' | 'WATCH' | 'REVIEW' | 'URGENT';
  alert_details: AlertDetail[];
  trend: TrendResult;

  engine_version: string;
  computed_at: string;             // ISO 8601
}

interface MetricResult {
  value: number;
  zscore: number;
  percentile: number;
  alert: 'NORMAL' | 'WATCH' | 'REVIEW' | 'URGENT';
}

interface AlertDetail {
  metric: string;
  rule_id: string;
  level: string;
  message: string;
}

interface TrendResult {
  flag: 'STABLE' | 'CROSSING_UP' | 'CROSSING_DOWN' | 'RAPID_CHANGE' | 'INSUFFICIENT_DATA';
  details: string;
  previous_measurements_used: number;
}
```

### 9.3 Eval Harness 接口 (对齐 E1)

```yaml
# C1 规则可直接生成的 eval cases 类型

eval_case_types:
  - type: "standard_selection"
    description: "给定 baby profile，验证选择了正确的标准"
    example:
      input: { birth_country: "CN", gestational_weeks: 39, age_days: 180 }
      expected: { standard: "WHO_2006" }

  - type: "zscore_calculation"
    description: "给定测量值和年龄，验证 z-score 计算正确"
    example:
      input: { standard: "WHO_2006", sex: "M", age_days: 180, weight_kg: 7.5 }
      expected: { weight_zscore: -0.33, tolerance: 0.05 }

  - type: "corrected_age"
    description: "给定早产儿信息，验证校正年龄计算正确"
    example:
      input: { gestational_weeks: 32, birth_date: "2024-01-01", measurement_date: "2024-07-01" }
      expected: { corrected_age_days: 124 }

  - type: "threshold_alert"
    description: "给定 z-score，验证告警级别正确"
    example:
      input: { weight_zscore: -3.2 }
      expected: { alert_level: "REVIEW" }

  - type: "trend_detection"
    description: "给定历史测量序列，验证趋势检测正确"
    example:
      input:
        measurements:
          - { age_days: 90, weight_percentile: 50 }
          - { age_days: 180, weight_percentile: 15 }
      expected: { trend_flag: "CROSSING_DOWN", alert: "WATCH" }

  - type: "input_validation"
    description: "给定异常输入，验证拦截正确"
    example:
      input: { weight_kg: 7200, age_days: 180 }
      expected: { rejected: true, reason: "unit_confusion" }

  - type: "newborn_weight_loss"
    description: "新生儿生理性体重下降验证"
    example:
      input: { birth_weight_kg: 3.5, current_weight_kg: 3.2, age_days: 3 }
      expected: { alert_level: "NORMAL", loss_percent: 8.6 }

  - type: "safety_gate_consistency"
    description: "验证 LLM 输出与规则引擎结论一致性"
    example:
      input: { rule_engine_alert: "REVIEW", llm_output: "宝宝生长完全正常" }
      expected: { gate_result: "BLOCKED", reason: "downgrade_alert" }
```

---

## 10. 风险、边界、不推荐做法、待人工复核项

### 10.1 医疗边界声明

```
本产品不是医疗设备，不提供医学诊断。
生长评估结果仅供参考，不替代专业医疗判断。
任何异常结果均建议咨询儿保/儿科医生。
```

### 10.2 不推荐做法

| # | 不推荐做法 | 原因 |
|---|-----------|------|
| 1 | LLM 自行计算 z-score | 不精确、不可复现、不可审计 |
| 2 | 混用多套标准比较 | 同一指标在不同标准下百分位不同，造成混淆 |
| 3 | 自动发送"诊断"给家长 | 超出产品边界，法律风险 |
| 4 | 显示 z-score 原始值给非专业用户 | 增加焦虑，家长难以理解 |
| 5 | 用 LLM 判断是否需要就医 | 必须由 deterministic threshold 决定 |
| 6 | 将 CDC 标准用于 0-2 岁默认评估 | CDC 自己推荐 0-2 岁用 WHO |
| 7 | 忽略体位修正（卧量 vs 站量） | 可造成约 0.7cm 系统误差 |
| 8 | 对足月儿使用 corrected age | 只有早产儿（<37周）需要校正 |
| 9 | 基于单次测量做趋势结论 | 至少需要 2 次测量 |
| 10 | 在 LLM 提示词中硬编 LMS 数据 | 数据量大、易错、无法更新 |

### 10.3 待人工复核项清单

| # | 项目 | 原因 | 优先级 |
|---|------|------|--------|
| 1 | 中国 WS/T 423 标准当前最新版本号 | 需从官方渠道确认是否有 2013 后更新 | P1 |
| 2 | 中国标准 LMS 参数数字化 | 需从标准文本手工提取或找到官方电子版 | P1 |
| 3 | 中国标准软件嵌入许可 | 行业标准公开发布，但商用嵌入需确认 | P1 |
| 4 | 中国标准是否采用 0.7cm 体位修正 | 需对照标准原文确认 | P2 |
| 5 | 极早产儿（<28周）校正期限 | 部分专家建议延长至 36 月龄，尚无统一共识 | P2 |
| 6 | 中国各省儿保信息系统实际用哪套标准 | 影响"与当地儿保对齐"功能设计 | P2 |
| 7 | 常规儿保体检间隔各地差异 | §9.1 中的间隔为通用版本，各地可能不同 | P2 |
| 8 | Fenton 2013 vs INTERGROWTH-21st 早产儿标准推荐 | 两者各有优势，需结合产品定位决定 | P2 |
| 9 | WHO 2006 数据表中 0-13 周按天/按周精细表的完整性 | 需下载验证 | P3 |
| 10 | 中国标准数据采集中母乳/配方奶喂养占比 | 影响与 WHO 标准的可比性 | P3 |

### 10.4 已知风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LMS 数据录入错误 | z-score 计算错误 → 误判 | 双人核对 + 用 WHO 官方计算器交叉验证 eval case |
| 家长输入错误 | 如体重录入 72 而非 7.2 | 输入验证规则 (§6.3) |
| 标准更新 | WHO/CDC 可能发布更新版 | standard_registry 含 version + last_verified |
| 网络传输精度丢失 | 浮点数问题 | DECIMAL 类型存储；API 返回固定精度 |
| 家长对结果过度焦虑 | 影响亲子关系和不必要就医 | 不显示 z-score；文案经过情感设计 |
| 家长对结果过度放心 | 延误就医 | 安全阈值保守设定；REVIEW/URGENT 强提示就医 |

---

## 11. 结论

### 11.1 核心设计决策总结

1. **标准选择**：默认 WHO 2006/2007，中国标准作为可选补充（数字化完成后）。
2. **计算方法**：统一使用 LMS 方法计算 z-score，再转 percentile。
3. **早产儿**：<37 周使用 corrected age，校正期限按指标不同分别设定。
4. **阈值分级**：四级（NORMAL / WATCH / REVIEW / URGENT），保守设定。
5. **分工**：Rule Engine 做所有数值计算和判定；LLM 只做自然语言交互层。
6. **安全**：safety_gate 最终检查 LLM 输出与规则引擎结论一致性。

### 11.2 与后续任务的衔接

| 后续任务 | 本文档提供 |
|---------|-----------|
| C2 (喂养/睡眠规则) | 规则引擎架构模式可复用；新生儿体重下降规则与喂养评估关联 |
| G1 (规则引擎实现) | 完整的计算公式、阈值、路由逻辑、API 接口定义 |
| D1 (schema 实现) | growth_event 完整字段定义与类型 |
| E1 (eval 实现) | 7 类可直接生成 eval case 的规则定义 |

### 11.3 推荐实施顺序

```
Phase 1: WHO 2006 (0-5岁) 全指标 → 核心功能可用
Phase 2: WHO 2007 Reference (5-18岁) → 扩展年龄段
Phase 3: 早产儿 Fenton/INTERGROWTH → 特殊人群
Phase 4: 中国标准 WS/T 423 → 本地化（依赖数字化完成）
Phase 5: CDC 2000 → 美国市场（如需要）
```

---

> **文档版本**: 1.0
> **创建日期**: 2026-04-12
> **文档状态**: `ready_for_review`
