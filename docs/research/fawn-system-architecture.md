# A2 — 宝宝专属 Agent 系统架构推荐方案

| 字段 | 值 |
|------|-----|
| 文档编号 | A2 |
| 状态 | **ready_for_review** |
| 前置依赖 | A1（技术选型评估，已 PASS） |
| 后续支撑 | D1（数据库草案）、E1（eval harness）、G1（MVP roadmap） |
| 日期 | 2026-04-11 |

---

## 1 执行摘要

本文档基于 A1 已确认结论，给出“宝宝专属 Agent”的**可落地系统架构**。

核心决策：
- **1 个主 Agent**（LangGraph 编排）承担对话、意图路由、工具调用；
- **少量确定性 Workflow/服务**（Temporal）承担疫苗提醒、定期随访、重试恢复等需要持久执行的场景；
- **自建 Deterministic Rule Engine** 承担所有医疗/健康高风险判断，LLM 严禁直接决策；
- **Plugin/Tool Layer** 作为 Agent 与外部系统的统一接口层。

不采用开放式多 Agent 自主协作架构。

---

## 2 设计原则

| # | 原则 | 说明 |
|---|------|------|
| P1 | 安全第一 | 医疗建议走规则引擎，LLM 只做信息呈现 |
| P2 | 单 Agent 简洁性 | 降低状态同步复杂度，可观测性更强 |
| P3 | 持久执行 | 定时任务/重试/补偿通过 Temporal Workflow 保障 |
| P4 | 最小权限与儿童隐私 | RBAC + 审计日志 + 数据分级 + 自托管优先 |
| P5 | 可演进 | 模块职责清晰，后续可按需拆分微服务 |
| P6 | 可评估 | 每条关键路径可插入 eval hook，支撑 E1 |

---

## 3 推荐总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端层 (Client)                       │
│   WeChat Mini-App / Flutter App / Web H5                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                    API Gateway / BFF                         │
│   认证 · 限流 · RBAC · 审计日志                              │
└──────┬───────────┬────────────┬──────────────┬──────────────┘
       │           │            │              │
┌──────▼───┐ ┌─────▼─────┐ ┌───▼────┐ ┌───────▼────────┐
│  主Agent │ │ Temporal  │ │ Rule   │ │  Plugin/Tool   │
│ LangGraph│ │ Workflows │ │ Engine │ │  Layer         │
│          │ │           │ │        │ │                │
│ 意图识别 │ │ 疫苗提醒  │ │ 红旗分诊│ │ 生长曲线计算  │
│ 对话管理 │ │ 定期随访  │ │ 剂量校验│ │ 喂养/睡眠记录 │
│ 工具路由 │ │ 重试补偿  │ │ 年龄校验│ │ 外部API适配   │
└──────┬───┘ └─────┬─────┘ └───┬────┘ └───────┬────────┘
       │           │            │              │
┌──────▼───────────▼────────────▼──────────────▼──────────────┐
│                     数据层 (Data Layer)                       │
│  PostgreSQL (主库) · Redis (缓存/会话) · Object Storage       │
│  审计日志表 · 加密字段 · 数据保留策略                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 4 分层架构

### 4.1 层次定义

| 层 | 职责 | 技术选型 |
|----|------|----------|
| **L1 客户端层** | 多端 UI、本地缓存、消息推送接收 | 微信小程序 / Flutter / Web |
| **L2 接入层** | 认证、限流、RBAC、请求路由、审计日志写入 | Nginx/Kong + 自研 Auth Service |
| **L3 编排层** | 主 Agent 对话编排、意图分发、工具调用 | LangGraph (Python) |
| **L4 工作流层** | 持久定时任务、saga 补偿、重试 | Temporal (Go SDK / Python SDK) |
| **L5 规则层** | 确定性医疗/健康判断 | 自建 Rule Engine (Python/JSON-DSL) |
| **L6 工具/插件层** | 外部能力封装：生长曲线、WHO 标准、通知渠道 | Plugin 接口 (Python) |
| **L7 数据层** | 持久存储、缓存、文件 | PostgreSQL + Redis + MinIO |

### 4.2 层间调用约束

- L3（主 Agent）**只能向下调用** L4/L5/L6，不可绕过。
- L5（规则引擎）的判断结果对 L3 具有**否决权**：若规则引擎返回“阻断”级别，Agent 必须终止当前意图并输出规则引擎提供的标准文案。
- L4（Temporal）可独立于 L3 运行（定时触发），但产出的通知/结果仍写入 L7 并可由 L3 读取。

---

## 5 核心模块职责

### 5.1 主 Agent（LangGraph）

```
职责：
├── 意图识别（intent classification）
├── 多轮对话状态管理（conversation state graph）
├── 工具/插件路由（tool dispatch）
├── 回复生成（response generation）
└── 上下文窗口管理（memory / summarization）
```

**关键设计**：
- LangGraph StateGraph 定义节点：`classify_intent → route → [tool_node | rule_check | direct_reply] → safety_gate → respond`
- `safety_gate` 节点在每次回复前强制调用规则引擎做最终安全校验
- 对话历史持久化到 PostgreSQL（`conversation` 表），Redis 缓存热会话

### 5.2 Temporal Workflows

| Workflow | 触发方式 | 说明 |
|----------|----------|------|
| `VaccineReminderWorkflow` | 定时（cron schedule） | 根据宝宝出生日期 + 国家免疫计划，提前 N 天推送提醒 |
| `GrowthCheckWorkflow` | 定时（月龄里程碑） | 到达关键月龄时提醒家长记录身高体重并自动生成曲线 |
| `FollowUpWorkflow` | 事件触发 | 红旗症状分诊后 24h/72h 随访，未回复则升级提醒 |
| `DataRetentionWorkflow` | 定时（每日） | 按数据保留策略清理/归档过期敏感数据 |

### 5.3 Deterministic Rule Engine

```
输入：结构化事实（年龄、体温、症状列表、体重 etc.）
输出：{decision, severity, message, action}

规则来源：
├── red_flag_rules.json      — 红旗症状 → 立即就医
├── vaccine_schedule.json    — 国家免疫计划
├── growth_standards.json    — WHO 生长标准 Z-score
├── dosage_rules.json        — 药物/营养素安全范围
└── age_validation.json      — 年龄相关功能可用性
```

- 规则文件版本化（Git 管理），变更需 review + 签名。
- 引擎本身无 LLM 依赖，纯确定性执行。
- 对外提供 `evaluate(rule_set, facts) → Decision` 统一接口。

### 5.4 Plugin/Tool Layer

| Plugin | 功能 |
|--------|------|
| `growth_curve_tool` | 输入身高/体重/头围 + 年龄，输出 WHO Z-score + 百分位 |
| `feeding_logger` | 结构化记录喂养事件（母乳/配方/辅食） |
| `sleep_logger` | 结构化记录睡眠事件 |
| `notification_sender` | 统一通知接口（微信模板消息 / 短信 / 站内信） |
| `family_member_mgr` | 家庭成员管理、角色绑定、权限查询 |

---

## 6 关键数据流

### 数据流 1：喂养记录

```
用户输入 “宝宝刚喝了120ml奶粉”
  │
  ▼
[L3 主Agent] classify_intent → “feeding_log”
  │
  ▼
[L3] 提取结构化参数: {type: formula, amount_ml: 120, time: now}
  │
  ▼
[L6 feeding_logger] 校验参数合理性(amount∈[10,500]) → 写入 DB
  │
  ▼
[L5 Rule Engine] 日累计量校验: 是否超过年龄建议上限?
  │                  ├─ 正常 → 返回确认文案
  │                  └─ 超限 → 返回温和提醒文案
  ▼
[L3 safety_gate] 合并结果 → 生成回复
  │
  ▼
用户收到: “已记录：配方奶120ml ✓ 今日累计480ml，接近建议上限(500ml)，注意观察。”
```

### 数据流 2：红旗症状分诊

```
用户输入 “宝宝3个月，体温39.5，精神很差”
  │
  ▼
[L3 主Agent] classify_intent → “symptom_triage”
  │
  ▼
[L3] 提取事实: {age_months: 3, temp_c: 39.5, mental_state: poor}
  │
  ▼
[L5 Rule Engine] evaluate("red_flag_rules", facts)
  │   规则匹配: “infant_<6m AND temp≥39 AND mental_poor” → RED_FLAG
  │   decision: BLOCK
  │   message: 标准化就医建议文案（含科室、注意事项）
  │
  ▼
[L3 safety_gate] decision=BLOCK → 禁止LLM自由发挥
  │                直接输出规则引擎文案
  ▼
用户收到: “⚠️ 请立即带宝宝就医！3月龄婴儿体温≥39°C且精神差属于紧急情况。
           建议前往：儿科急诊。就医前：物理降温，记录体温变化。”
  │
  ▼
[L4 FollowUpWorkflow] 启动 → 24h后自动随访 → 未回复则72h再次提醒
```

### 数据流 3：疫苗提醒（Temporal 驱动）

```
[L4 VaccineReminderWorkflow] (cron: 每日 08:00)
  │
  ▼
查询 DB: 所有宝宝 → 计算当前月龄 → 匹配 vaccine_schedule.json
  │
  ▼
[L5 Rule Engine] evaluate("vaccine_schedule", {age_months, completed_vaccines})
  │   输出: 未来7天内应接种的疫苗列表
  │
  ▼
[L6 notification_sender] 向主照护人发送提醒
  │   “宝宝即将满2月龄，建议接种：脊灰灭活疫苗(IPV)第1剂。”
  │
  ▼
[L7] 写入 reminder_log 表（用于审计 + 防重复）
```

### 数据流 4：家庭多成员协作

```
爸爸(角色:caregiver)输入 “看看今天谁给宝宝喂过奶”
  │
  ▼
[L2 API Gateway] RBAC校验 → 爸爸有 baby_123 的 read 权限 ✓
  │
  ▼
[L3 主Agent] classify_intent → “query_feeding_log”
  │
  ▼
[L6 feeding_logger] 查询今日 baby_123 的喂养记录
  │   返回: [{time: 08:00, by: 妈妈, type: breast, duration: 15min},
  │          {time: 12:00, by: 奶奶, type: formula, amount: 120ml}]
  │
  ▼
[L3] 生成可读回复（脱敏处理：不暴露其他成员手机号等隐私字段）
  │
  ▼
[L7] 写入 audit_log: {who: 爸爸, action: read_feeding, baby: 123, time: now}
```

---

## 7 单 Agent vs 多 Agent 取舍

| 维度 | 单主 Agent + 确定性服务（推荐） | 多 Agent 自主协作（不推荐） |
|------|--------------------------------|---------------------------|
| **架构复杂度** | 低，状态集中在一个 StateGraph | 高，需要共识协议/消息总线 |
| **可观测性** | 单条 trace 覆盖全链路 | 多 agent 交互难以 trace |
| **安全可控** | safety_gate 单点把关 | 多 agent 之间可能绕过安全检查 |
| **延迟** | 1 次 LLM 调用 + 工具调用 | 多次 agent 间 LLM 调用叠加 |
| **成本** | 可控（1 次 LLM） | 不可控（agent 间对话爆炸） |
| **适用场景** | 本项目：垂直领域、流程可枚举 | 开放性研究、创意协作 |

**结论**：宝宝 Agent 的场景完全可枚举（记录、提醒、分诊、查询），不需要 agent 间“讨论”。采用**单主 Agent + 确定性 Workflow/服务**是最优解。

未来如需扩展（如增加“营养师 Agent”），可在 LangGraph 中新增 subgraph 节点，仍由主 Agent 统一编排，而非引入独立 Agent 自治。

---

## 8 Deterministic Rules vs LLM 分工

```
┌────────────────────────────────────────────────────────┐
│              分工矩阵 (Decision Matrix)                 │
├──────────────────────┬─────────────┬───────────────────┤
│       能力           │  规则引擎    │      LLM          │
├──────────────────────┼─────────────┼───────────────────┤
│ 红旗症状判定         │     ✅      │      ❌           │
│ 疫苗时间表匹配       │     ✅      │      ❌           │
│ 生长曲线 Z-score     │     ✅      │      ❌           │
│ 药物/营养素剂量校验  │     ✅      │      ❌           │
│ 年龄合规校验         │     ✅      │      ❌           │
│ 意图识别             │     ❌      │      ✅           │
│ 自然语言理解/生成    │     ❌      │      ✅           │
│ 多轮对话管理         │     ❌      │      ✅           │
│ 非结构化输入解析     │     ❌      │      ✅           │
│ 情感化回复/安慰      │     ❌      │      ✅           │
│ 育儿知识问答(非医疗) │     ❌      │      ✅           │
├──────────────────────┼─────────────┼───────────────────┤
│ 回复最终安全审核     │     ✅      │      ❌           │
│ (safety_gate)        │  否决权      │                   │
└──────────────────────┴─────────────┴───────────────────┘
```

**核心原则**：凡涉及健康/医疗/安全判断，一律由规则引擎决定，LLM 仅负责将规则引擎的结论“翻译”为友好的自然语言。`safety_gate` 确保 LLM 生成的任何内容不会与规则引擎结论矛盾。

---

## 9 风险控制点

| # | 风险 | 控制措施 |
|---|------|----------|
| R1 | LLM 幻觉导致错误医疗建议 | safety_gate 强制审核；医疗场景只输出规则引擎文案 |
| R2 | 规则库过时/遗漏 | 规则文件 Git 版本化 + 定期 review 周期（季度） |
| R3 | 儿童数据泄露 | 自托管；字段级加密；RBAC；审计日志；数据保留策略 |
| R4 | Temporal Worker 宕机 | Temporal 原生重试 + 告警；关键 Workflow 设置 deadline |
| R5 | LLM 服务不可用 | 降级模式：规则引擎 + 模板回复仍可工作 |
| R6 | 多成员权限越权 | API Gateway 层 RBAC 强制校验；最小权限原则 |
| R7 | 输入注入攻击 | LLM 输入清洗 + 输出过滤；工具参数 schema 校验 |
| R8 | 通知轰炸 | 每用户每日通知上限；合并同类提醒 |
| R9 | 规则引擎与 LLM 结论矛盾 | safety_gate 中规则引擎拥有绝对否决权 |

---

## 10 部署与运行建议

### 10.1 部署拓扑（MVP 阶段）

```
┌──────────────────────────────────────────────────┐
│              单节点 / 小规模 K8s 集群              │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ BFF API  │  │ LangGraph│  │  Temporal     │  │
│  │ (FastAPI)│  │ Agent    │  │  Server+Worker│  │
│  │ + Auth   │  │ Service  │  │               │  │
│  └────┬─────┘  └────┬─────┘  └───────┬───────┘  │
│       │              │                │          │
│  ┌────▼──────────────▼────────────────▼───────┐  │
│  │  PostgreSQL 15  │  Redis 7  │  MinIO       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 10.2 关键配置

| 项 | 建议 |
|----|------|
| LLM 模型 | 主模型 Claude Sonnet/GPT-4o-mini（成本/质量平衡）；意图分类可用更小模型 |
| PostgreSQL | 开启 TDE（透明数据加密）；敏感字段应用级加密(AES-256) |
| Temporal | 使用 PostgreSQL 作为持久化后端（复用基础设施） |
| 日志 | 结构化 JSON 日志 → stdout → 集中采集（Loki/ELK） |
| 监控 | Prometheus + Grafana；关键指标：LLM 延迟、规则引擎命中率、Workflow 成功率 |
| 备份 | PostgreSQL WAL 归档 + 每日全量备份；RPO < 1h |

### 10.3 扩展路径

1. **MVP**：单节点 Docker Compose 部署，1 个 LLM 实例
2. **增长期**：K8s 部署，LangGraph Agent 水平扩展，Redis Cluster
3. **规模期**：LLM 请求分流（高优先级/低优先级队列），读写分离

---

## 11 待验证项

| # | 待验证项 | 验证方式 | 优先级 | 关联阶段 |
|---|----------|----------|--------|----------|
| V1 | LangGraph StateGraph 在复杂多轮对话下的状态管理是否足够 | Prototype + E1 eval | P0 | D1/E1 |
| V2 | safety_gate 延迟是否影响用户体验（目标 < 200ms） | 基准测试 | P0 | E1 |
| V3 | Temporal cron 精度是否满足疫苗提醒（分钟级） | 部署验证 | P1 | G1 |
| V4 | 规则引擎 JSON-DSL 表达力是否覆盖所有红旗症状场景 | 医学顾问 review | P0 | D1 |
| V5 | 小程序 WebSocket 长连接在弱网下的稳定性 | 真机测试 | P1 | G1 |
| V6 | 多成员 RBAC 在实际家庭场景下的易用性 | 用户测试 | P2 | G1 |
| V7 | 字段级加密对查询性能的影响 | 基准测试 | P1 | D1 |
| V8 | LLM 降级模式（纯规则+模板）的用户接受度 | A/B 测试 | P2 | E1 |

---

## 12 结论

1. **推荐架构**：单主 Agent（LangGraph 编排）+ Temporal 持久 Workflow + 自建确定性规则引擎 + Plugin/Tool 层。
2. **不采用**多 Agent 自主协作，原因是本场景可枚举、安全要求高、多 Agent 增加不必要的复杂度和不可控性。
3. **安全底线**：所有医疗/健康判断由规则引擎决定，LLM 只做自然语言表达，safety_gate 拥有否决权。
4. **持久执行**：疫苗提醒、随访、数据清理等场景由 Temporal Workflow 保障可靠执行。
5. **隐私保护**：自托管优先、RBAC、字段级加密、审计日志、数据保留策略。
6. 本架构可直接支撑后续 D1（数据库草案——表结构从模块职责推导）、E1（eval harness——每条数据流即一条测试用例）、G1（MVP roadmap——按模块分 milestone）。

**建议下一步**：进入 D1（数据库草案），基于本文档第 5/6 节推导实体关系和表结构。

---

## 附录 A：完整架构图（ASCII）

```
                          ┌─────────────┐
                          │  用户(多端)  │
                          │ 小程序/App  │
                          └──────┬──────┘
                                 │
                          ┌──────▼──────┐
                          │ API Gateway │
                          │ Auth+RBAC   │
                          │ Rate Limit  │
                          │ Audit Log   │
                          └──────┬──────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
        ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
        │  主 Agent   │  │  Temporal   │  │   Rule       │
        │ (LangGraph) │  │  Workflows  │  │   Engine     │
        │             │  │             │  │              │
        │ ┌─────────┐ │  │ Vaccine     │  │ red_flag     │
        │ │classify  │ │  │ Reminder    │  │ vaccine_sch  │
        │ │intent    │ │  │             │  │ growth_std   │
        │ └────┬────┘ │  │ Growth      │  │ dosage       │
        │ ┌────▼────┐ │  │ Check       │  │              │
        │ │ route   │ │  │             │  └───────┬──────┘
        │ └────┬────┘ │  │ Follow-up   │          │
        │ ┌────▼────┐ │  │             │          │
        │ │tool_call│ │  │ Data        │          │
        │ └────┬────┘ │  │ Retention   │          │
        │ ┌────▼────┐ │  └──────┬──────┘          │
        │ │safety_  │◄├─────────┼──────────────────┘
        │ │gate     │ │         │
        │ └────┬────┘ │         │
        │ ┌────▼────┐ │         │
        │ │respond  │ │         │
        │ └─────────┘ │         │
        └──────┬──────┘         │
               │                │
        ┌──────▼──────┐         │
        │ Plugin/Tool │         │
        │ Layer       │         │
        │             │         │
        │ growth_curve│         │
        │ feed_logger │         │
        │ sleep_logger│         │
        │ notif_sender│◄────────┘
        │ family_mgr  │
        └──────┬──────┘
               │
        ┌──────▼──────────────────────┐
        │        Data Layer           │
        │ PostgreSQL │ Redis │ MinIO  │
        │ (加密)     │(缓存) │(文件)  │
        └─────────────────────────────┘
```

---

## 附录 B：与后续阶段的接口约定

| 后续阶段 | 从 A2 获取 | 约定 |
|----------|-----------|------|
| D1 数据库草案 | 模块职责(§5) + 数据流(§6) | 每个 Plugin/Logger 对应 1+ 数据表 |
| E1 Eval Harness | 4 条数据流(§6) | 每条流作为 1 个 end-to-end 测试场景 |
| G1 MVP Roadmap | 模块列表(§5) + 优先级(§11) | P0 模块进 MVP，P1/P2 进后续迭代 |