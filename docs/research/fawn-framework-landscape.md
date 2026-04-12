# 01 — Agent Framework Landscape & Comparison

> **任务 ID**: A1  
> **交付物**: 01-agent-framework-landscape.md  
> **版本**: v1.0  
> **日期**: 2026-04-11  
> **状态**: ready_for_review

---

## 1 执行摘要

本文档针对「宝宝专属 agent」场景（喂养/睡眠/生长记录、疫苗提醒、红旗症状分诊、家庭多成员协作、隐私与医疗边界），对当前主流的 10 个 agent/framework/workflow 方案进行系统性评估，最终给出推荐技术组合与不推荐项。

**核心结论**：宝宝 agent 不是典型的"自由聊天 agent"，而是一个**高安全边界、强规则约束、需要长期状态管理**的垂直应用。因此我们推荐采用「**LangGraph（orchestration）+ Temporal（durable workflow）+ 自建 deterministic rule engine + Semantic Kernel 式 plugin 架构**」的分层组合，而非追求单一全能框架。

**关键洞察**：
1. 医疗/健康相关的判断（红旗症状、生长曲线异常）**必须**走 deterministic rules，不能依赖 LLM 概率性输出。
2. 疫苗提醒、定时任务等需要 durable execution（跨天/周/月），纯 agent 框架无法胜任，需要 Temporal/Inngest 级别的 workflow engine。
3. 隐私保护（COPPA/GDPR/《个人信息保护法》/《儿童个人信息网络保护规定》）要求数据必须自托管或合规云，排除了大部分纯 SaaS 方案。
4. 家庭多成员协作需要 RBAC + 审计日志，这是框架选型的硬约束。

---

## 2 评估维度

针对宝宝 agent 场景，我们定义以下 8 个评估维度：

| 维度 | 权重 | 说明 |
|------|------|------|
| **D1 编排模型** | ★★★ | 是否支持有状态图/DAG/条件分支；能否将 LLM 调用与 deterministic rule 混合编排 |
| **D2 持久化与长运行** | ★★★ | checkpoint、跨会话 memory、定时任务（疫苗提醒等跨天/周任务） |
| **D3 安全栅栏** | ★★★ | 输入/输出 guardrails、human-in-the-loop、医疗内容审查 |
| **D4 工具集成** | ★★☆ | 自定义 function tools、外部 API、数据库、多模态（照片/音频） |
| **D5 隐私与合规** | ★★★ | 自托管能力、数据不出境、加密、审计日志、COPPA/GDPR 兼容 |
| **D6 多成员协作** | ★★☆ | RBAC、多用户 session 隔离、家庭成员权限分级 |
| **D7 可观测性** | ★★☆ | tracing、logging、replay、调试工具 |
| **D8 成熟度与生态** | ★☆☆ | 社区活跃度、文档质量、生产案例、长期维护预期 |

---

## 3 候选方案逐项分析

### 3.1 LangGraph

| 属性 | 值 |
|------|-----|
| **定位** | 低层级 agent 编排框架与运行时，构建长运行有状态 agent |
| **核心模型** | 图状态机（Graph-based state machine），节点=计算步骤，边=转换条件 |
| **语言** | Python、JavaScript/TypeScript |
| **许可** | MIT |
| **官方文档** | [docs.langchain.com/langgraph](https://docs.langchain.com/oss/python/langgraph/overview) |

**优点**：
- **图编排模型**：天然支持条件分支、循环、并行节点，可将 deterministic rule 节点与 LLM 节点混合编排——这正是宝宝 agent 的核心需求（例如：先走规则引擎判断红旗症状 → 只有非紧急时才进入 LLM 对话）。
- **Durable execution**：内置 checkpoint 机制，agent 可从失败处恢复，支持长运行工作流。
- **Human-in-the-loop**：支持在任意节点暂停、审查、修改 agent 状态后继续执行——适合医疗敏感场景的人工审核。
- **有状态 memory**：支持短期工作 memory 和跨会话长期 memory。
- **可观测性**：与 LangSmith 集成，提供 tracing、调试、回放。
- **生产验证**：Klarna、Uber、J.P. Morgan 等企业使用。

**缺点**：
- 与 LangChain 生态绑定较深，学习曲线较陡。
- 自身不提供 durable scheduling（定时任务），需要外接 Temporal/cron。
- LangSmith 商业化组件的定价需评估。
- 图定义在复杂场景下可能变得难以维护。

**宝宝 agent 适配性**：⭐⭐⭐⭐⭐ **强推荐作为 orchestration 层**
- 图编排 + human-in-the-loop + checkpoint 完美匹配医疗安全场景。
- 可将 rule engine 作为纯函数节点嵌入图中。
- 需外接 Temporal 补齐 durable scheduling 能力。

---

### 3.2 CrewAI

| 属性 | 值 |
|------|-----|
| **定位** | 多 agent 协作框架，角色扮演式任务分配 |
| **核心模型** | Agents（角色）→ Tasks（任务）→ Crews（团队）→ Flows（工作流） |
| **语言** | Python（Enterprise 版支持更多） |
| **许可** | MIT（开源版）/ 商业许可（Enterprise） |
| **官方文档** | [docs.crewai.com](https://docs.crewai.com/introduction) |

**优点**：
- 两层编排模型：Flows 管理状态与控制流，Crews 内 agents 自主协作。
- 内置 memory 系统和工具集成。
- 企业安全与合规关注点。
- 快速原型开发效率高。

**缺点**：
- **多 agent 角色扮演模式不适合宝宝 agent**：宝宝 agent 不需要多个 AI agent "讨论"来决定该记录什么——这是确定性操作。
- 自主协作的不确定性与医疗安全场景冲突。
- Agent 间对话消耗大量 token，成本高。
- 对 deterministic rule 的支持弱于 LangGraph 的图节点模型。
- 生态相比 LangChain 较小。

**宝宝 agent 适配性**：⭐⭐ **不推荐**
- 多 agent 角色扮演是"杀鸡用牛刀"，增加复杂度和不确定性。
- 医疗场景需要确定性，不需要多个 agent "讨论"。

---

### 3.3 AutoGen / AG2

| 属性 | 值 |
|------|-----|
| **定位** | 多 agent 对话框架，支持代码执行与人机协作 |
| **核心模型** | Agent 间消息传递式对话，支持代码沙箱执行 |
| **语言** | Python |
| **许可** | MIT（AutoGen）/ Apache 2.0（AG2 fork） |
| **官方文档** | [microsoft.github.io/autogen](https://microsoft.github.io/autogen/) |

**优点**：
- 微软背书，社区活跃。
- 强大的代码执行沙箱（Docker-based）。
- 支持多 agent 对话模式和 human-in-the-loop。
- 0.4+ 版本重构了架构，更模块化。
- 与 Azure 生态集成良好。

**缺点**：
- **版本分裂**：AutoGen 从微软拆分后形成 AG2 fork，生态碎片化，长期路线图不确定。（需二次验证：截至 2026 年两个分支的合并/分化状态）
- 多 agent 对话模式同样不适合宝宝 agent 场景。
- 代码执行沙箱对宝宝 agent 无用。
- 持久化和 scheduling 能力弱。
- 与 Azure 绑定可能引入供应商锁定。

**宝宝 agent 适配性**：⭐⭐ **不推荐**
- 与 CrewAI 类似的问题：多 agent 对话模型不匹配需求。
- 版本分裂带来的维护风险不适合长期运行的健康应用。

---

### 3.4 OpenAI Agents SDK

| 属性 | 值 |
|------|-----|
| **定位** | 轻量级 Python agent 框架，Swarm 的生产级继承者 |
| **核心模型** | Agents（指令+工具）→ Handoffs（agent 间委派）→ Guardrails（输入/输出校验） |
| **语言** | Python |
| **许可** | MIT |
| **官方文档** | [openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/) |

**优点**：
- **内置 Guardrails 系统**：输入/输出校验机制，非常适合医疗安全场景。
- **极轻量**：最少抽象，快速上手。
- **Handoffs 机制**：agent 间任务委派清晰，可做"症状预筛 agent → 记录 agent"。
- **Tracing**：内置可视化、调试、监控。
- **Voice agent**：支持实时语音交互（对宝宝 agent 的语音输入有用）。
- Function tool 自动 schema 生成 + Pydantic 校验。
- MCP server 支持。

**缺点**：
- **强绑定 OpenAI API**：模型选择受限，无法自托管模型——隐私合规重大风险。
- 缺少 durable execution / checkpoint（无法做疫苗提醒等长周期任务）。
- 缺少内置持久化 memory。
- Guardrails 虽好但仅限 OpenAI 模型上下文。
- 中国区 API 访问稳定性存疑。

**宝宝 agent 适配性**：⭐⭐⭐ **有条件推荐，但不作为主框架**
- Guardrails 设计思路值得借鉴。
- 供应商锁定和隐私问题是硬伤。
- 可作为 OpenAI 模型接入层使用，但 orchestration 不应依赖它。

---

### 3.5 Semantic Kernel

| 属性 | 值 |
|------|-----|
| **定位** | 轻量级企业级 AI 中间件，连接 AI 模型与现有代码 |
| **核心模型** | Plugins（技能）+ Connectors（连接器）+ Planner（规划器） |
| **语言** | C#、Python、Java |
| **许可** | MIT |
| **官方文档** | [learn.microsoft.com/semantic-kernel](https://learn.microsoft.com/en-us/semantic-kernel/overview/) |

**优点**：
- **多语言支持**（C#/Python/Java），v1.0+ 承诺非破坏性更新。
- **企业级设计**：telemetry、hooks、filters，适合医疗合规场景的审计需求。
- **Plugin 架构**：通过 OpenAPI spec 集成，与微软 365 Copilot 共享扩展标准。
- **模型无关**：可切换底层模型，不绑定单一供应商。
- **微软 + Fortune 500 背书**。
- **未来兼容**：设计为"模型可换"架构。

**缺点**：
- 编排能力不如 LangGraph 的图模型灵活。
- 社区 / 中文生态相比 LangChain 较小。
- Process Framework（workflow 编排）仍较新，生产案例少。（需二次验证：2026 年成熟度）
- Planner 的自主规划能力在医疗场景下不够可控。

**宝宝 agent 适配性**：⭐⭐⭐⭐ **推荐作为 plugin/tool 层**
- Plugin 架构适合封装喂养记录、生长曲线计算、疫苗查询等工具。
- 企业级审计能力匹配合规需求。
- 但不建议用其 Planner 做核心编排——应由 LangGraph 图控制。

---

### 3.6 Dify

| 属性 | 值 |
|------|-----|
| **定位** | 开源低代码 AI 应用平台，可视化 workflow + RAG |
| **核心模型** | 可视化画布定义工作流 → 连接工具/数据源 → 部署 AI 应用 |
| **语言** | Python（后端）/ React（前端）/ REST API |
| **许可** | Apache 2.0（开源社区版）/ 商业许可（Enterprise） |
| **官方文档** | [docs.dify.ai](https://docs.dify.ai/) |

**优点**：
- **低代码可视化**：非工程师（如产品经理、儿科顾问）也能参与 workflow 设计。
- **内置 RAG pipeline**：适合接入儿科知识库。
- **自托管**：可部署在私有服务器，满足隐私合规。
- **快速原型**：分钟级搭建 AI 应用。
- **多模型支持**：可切换 OpenAI/Claude/本地模型。
- 活跃社区和 changelog。

**缺点**：
- **Workflow 表达力有限**：复杂条件分支、循环、子图等不如 LangGraph。
- **不适合做核心 agent 编排**：更像"AI 应用搭建平台"而非"agent 框架"。
- 持久化 / durable execution 能力弱。
- 缺少 RBAC 和多用户 session 管理。
- 生产环境大规模部署案例较少。

**宝宝 agent 适配性**：⭐⭐⭐ **推荐作为快速原型验证工具，不推荐作为生产架构**
- 适合在设计阶段快速验证"喂养记录 → 分析 → 建议"的 RAG 流程。
- 生产阶段应迁移到 LangGraph + 自建 pipeline。

---

### 3.7 Temporal

| 属性 | 值 |
|------|-----|
| **定位** | 分布式持久化工作流引擎 |
| **核心模型** | Durable Execution：Workflow + Activities，平台级故障恢复 |
| **语言** | Go、Java、Python、TypeScript、.NET |
| **许可** | MIT（Server）/ 商业许可（Cloud） |
| **官方文档** | [docs.temporal.io](https://docs.temporal.io/evaluate/why-temporal) |

**优点**：
- **Durable Execution**：工作流可靠完成，无论执行分钟还是数年——完美匹配疫苗提醒（跨周/月/年）。
- **平台级故障恢复**：开发者不需要手写重试/超时/补偿逻辑。
- **状态可视性**：CLI + Web UI 监控、调试。
- **多语言 SDK**：Go/Java/Python/TS/.NET。
- **生产验证**：Netflix、Uber、Stripe 等大规模使用。
- **可自托管**：满足隐私合规。

**缺点**：
- **不是 AI agent 框架**：没有 LLM 集成、prompt 管理、tool calling 等。
- 运维复杂度高（需要 Temporal Server + Worker）。
- 过度设计风险：MVP 阶段可能太重。
- 学习曲线较陡。

**宝宝 agent 适配性**：⭐⭐⭐⭐⭐ **强推荐作为 durable workflow 层**
- 疫苗提醒、定期生长检查提醒、体检日程管理 → 需要跨天/周/月的可靠 scheduling。
- LangGraph 负责"对话 + 推理"编排，Temporal 负责"定时 + 长运行"编排——二者互补。
- 可自托管满足隐私合规。

---

### 3.8 Inngest

| 属性 | 值 |
|------|-----|
| **定位** | 事件驱动的 durable function/workflow 平台 |
| **核心模型** | 事件触发 → Step functions（自动重试/暂停/恢复）→ 持久化执行 |
| **语言** | TypeScript、Python、Go |
| **许可** | Server Source Available / Cloud SaaS |
| **官方文档** | [inngest.com/docs](https://www.inngest.com/docs) |

**优点**：
- **比 Temporal 更轻量**：无需独立 server，可嵌入现有应用。
- 事件驱动模型适合宝宝 agent 的"事件 → 响应"模式（喂奶记录 → 触发分析 → 推送提醒）。
- Step functions 自动重试和持久化。
- 支持 cron/scheduled functions。
- 开发体验好，学习曲线低。

**缺点**：
- 生态和生产案例不如 Temporal 成熟。
- 许可证非标准开源（Server Source Available），长期风险需评估。
- 自托管方案不如 Temporal 成熟。
- 复杂 workflow 编排能力不如 Temporal。

**宝宝 agent 适配性**：⭐⭐⭐⭐ **推荐作为 Temporal 的轻量替代（MVP 阶段）**
- MVP 阶段如果 Temporal 太重，Inngest 是优秀的替代。
- 事件驱动模型天然匹配"记录事件 → 触发分析 → 推送提醒"。
- 生产规模化后可考虑迁移到 Temporal。

---

### 3.9 Haystack (deepset)

| 属性 | 值 |
|------|-----|
| **定位** | 端到端 NLP/RAG 框架，Pipeline-as-code |
| **核心模型** | Component（组件）→ Pipeline（流水线），声明式 YAML 或 Python 定义 |
| **语言** | Python |
| **许可** | Apache 2.0 |
| **官方文档** | [docs.haystack.deepset.ai](https://docs.haystack.deepset.ai/) |

**优点**：
- **RAG pipeline 专精**：适合构建儿科知识检索系统。
- Pipeline 组件化，可插拔。
- 支持多种向量数据库和 LLM。
- 社区活跃，文档清晰。
- Apache 2.0 开源。

**缺点**：
- **不是 agent 编排框架**：缺少状态管理、对话控制、agent 循环。
- 缺少 durable execution 和 scheduling。
- 缺少 guardrails 和 human-in-the-loop。
- 主要面向 NLP pipeline，不是交互式 agent。

**宝宝 agent 适配性**：⭐⭐⭐ **推荐作为 RAG/检索组件，不推荐作为主框架**
- 可用于构建"儿科知识库检索"这一个子模块。
- 但宝宝 agent 的核心价值不在"问答检索"而在"规则驱动的记录+提醒+分诊"。
- 如果已选 LangGraph，其 RAG 能力可通过 LangChain 集成获得，无需额外引入 Haystack。

---

### 3.10 纯代码自建（Custom Orchestration + Rule Engine）

| 属性 | 值 |
|------|-----|
| **定位** | 不使用 agent 框架，用 Python/TS + 传统软件工程模式构建 |
| **核心模型** | 状态机/有限状态机 + 规则引擎 + LLM API 调用 |
| **语言** | 任意 |
| **许可** | N/A |

**优点**：
- **完全可控**：每一行代码都可审计，无框架黑箱——医疗合规的最高保障。
- **无供应商锁定**。
- **性能最优**：无框架开销。
- **deterministic rule 实现最纯粹**：规则引擎可用 JSON Schema / 决策表 / 经典 if-else。

**缺点**：
- 需要自行实现：checkpoint、retry、human-in-the-loop、tracing、memory 管理。
- 开发周期长，维护负担大。
- 错过框架社区的 bug fix 和功能更新。
- 难以快速 iterate。

**宝宝 agent 适配性**：⭐⭐⭐ **不推荐作为全栈方案，但 deterministic rule engine 应自建**
- 在 LangGraph 图中，"红旗症状判断""生长曲线 percentile 计算""疫苗日程规则"等节点**必须是自建的 deterministic code**，不能依赖任何框架的"AI 判断"。
- Orchestration 层仍建议用 LangGraph 而非完全自建。

---

## 4 对比表

| 框架 | 编排模型 D1 | 持久化/长运行 D2 | 安全栅栏 D3 | 工具集成 D4 | 隐私合规 D5 | 多成员协作 D6 | 可观测性 D7 | 成熟度 D8 | 宝宝 agent 适配 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **LangGraph** | ★★★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★ | ★★★★★ | ★★★★ | ⭐⭐⭐⭐⭐ |
| **CrewAI** | ★★★★ | ★★★ | ★★★ | ★★★★ | ★★★ | ★★ | ★★★ | ★★★ | ⭐⭐ |
| **AutoGen/AG2** | ★★★★ | ★★ | ★★★ | ★★★★ | ★★★ | ★★ | ★★★ | ★★★ | ⭐⭐ |
| **OpenAI Agents SDK** | ★★★ | ★★ | ★★★★★ | ★★★★ | ★★ | ★★ | ★★★★ | ★★★★ | ⭐⭐⭐ |
| **Semantic Kernel** | ★★★ | ★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★★ | ⭐⭐⭐⭐ |
| **Dify** | ★★★ | ★★ | ★★ | ★★★★ | ★★★★ | ★★ | ★★★ | ★★★ | ⭐⭐⭐ |
| **Temporal** | ★★★ | ★★★★★ | ★★ | ★★★ | ★★★★★ | ★★★ | ★★★★★ | ★★★★★ | ⭐⭐⭐⭐⭐ |
| **Inngest** | ★★★ | ★★★★ | ★★ | ★★★ | ★★★★ | ★★ | ★★★★ | ★★★ | ⭐⭐⭐⭐ |
| **Haystack** | ★★ | ★ | ★★ | ★★★★ | ★★★★ | ★ | ★★★ | ★★★★ | ⭐⭐⭐ |
| **纯代码自建** | ★★★★★ | ★★ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★ | N/A | ⭐⭐⭐ |

> **注**：评分基于宝宝 agent 场景需求加权，非通用框架质量评分。

---

## 5 推荐技术组合

### 5.1 主推荐架构（分层组合）

宝宝 agent 不应选择单一框架，而应按职责分层组合：

```
┌─────────────────────────────────────────────────┐
│              用户交互层 (UI/API)                  │
│  Mobile App / Web / 语音输入                      │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│     Orchestration 层：LangGraph                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ LLM 节点 │ │ Rule 节点│ │ Tool Call 节点   │ │
│  │(对话/摘要)│ │(分诊/曲线)│ │(DB/API/通知)    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  checkpoint ◄─► state management                │
│  human-in-the-loop at safety-critical nodes     │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│     Durable Workflow 层：Temporal / Inngest       │
│  - 疫苗提醒 scheduling (跨月/年)                  │
│  - 定期生长曲线评估                               │
│  - 体检日程管理                                   │
│  - 数据导出/报告生成                              │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│     Tool / Plugin 层：Semantic Kernel 风格        │
│  - 喂养记录 CRUD                                  │
│  - 睡眠记录 CRUD                                  │
│  - 生长曲线 percentile 计算                       │
│  - 疫苗日程查询                                   │
│  - 红旗症状规则引擎                               │
│  - 知识库检索 (RAG)                               │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│     Deterministic Rule Engine（自建）             │
│  - WHO/CDC/中国生长标准 percentile 查表            │
│  - 疫苗接种日程规则 (中国 NIP + WHO EPI)          │
│  - 红旗症状分诊决策树                              │
│  - 喂养量/频率异常阈值                             │
│  - corrected age 计算 (早产儿)                    │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│     数据与安全层                                   │
│  - PostgreSQL (事件流/记录)                       │
│  - 向量数据库 (知识检索)                          │
│  - 加密存储 + RBAC                                │
│  - 审计日志 (每次 LLM 调用 + 规则触发)            │
│  - 数据本地化/合规边界                             │
└─────────────────────────────────────────────────┘
```

### 5.2 各层选型决策

| 层级 | 推荐方案 | 备选方案 | 决策理由 |
|------|---------|---------|---------|
| **Orchestration** | LangGraph | 纯代码 state machine | 图编排 + checkpoint + HITL，减少自建工作量 |
| **Memory** | LangGraph 内置 + PostgreSQL | Redis（短期缓存） | 跨会话 memory 持久化到 PG，LangGraph checkpoint 管理对话状态 |
| **Durable Workflow** | Temporal | Inngest（MVP 阶段） | 疫苗提醒需要年级别可靠 scheduling；MVP 可先用 Inngest 降低运维负担 |
| **Tool/Plugin** | 自建 Python functions，遵循 Semantic Kernel plugin 设计模式 | LangChain Tools | OpenAPI spec 定义，可审计、可测试 |
| **Rule Engine** | 自建 Python 模块 | Drools / JSON Rules Engine | 医疗规则必须 deterministic + 可审计 + 无 LLM 依赖 |
| **RAG/知识检索** | LangChain 集成的向量检索 | Haystack | 已在 LangGraph 生态内，无需额外引入 |
| **安全栅栏** | 自建 guardrails + LangGraph HITL 节点 | Guardrails AI / NeMo Guardrails | 医疗场景需要定制化规则，通用 guardrails 不够 |
| **可观测性** | LangSmith / OpenTelemetry | Langfuse（开源替代） | tracing + replay + 审计日志 |
| **审计** | PostgreSQL audit log + OpenTelemetry | Elasticsearch | 每次 LLM 调用、规则触发、用户操作均记录 |

### 5.3 MVP vs 成熟阶段差异

| 能力 | MVP 阶段 | 成熟阶段 |
|------|---------|---------|
| Orchestration | LangGraph（单图） | LangGraph（子图 + 多租户） |
| Durable Workflow | Inngest / cron job | Temporal |
| RAG | 简单向量检索 | 分层知识库 + 重排序 |
| Rule Engine | Python if-else + 查表 | 结构化决策表 + 版本控制 |
| 安全栅栏 | 硬编码 input/output 过滤 | 多层 guardrails + HITL 审核面板 |
| 可观测性 | 日志文件 + 简单 dashboard | LangSmith/Langfuse + OpenTelemetry |

---

## 6 不推荐项及原因

| 框架 | 不推荐原因 | 核心风险 |
|------|-----------|---------|
| **CrewAI** | 多 agent 角色扮演模式不匹配宝宝 agent 的确定性需求；agent 间"讨论"增加不确定性和 token 成本；医疗场景不允许 AI 自主"协商"出健康建议 | 安全性、成本 |
| **AutoGen/AG2** | 同 CrewAI 的多 agent 问题；版本分裂（AutoGen vs AG2 fork）带来长期维护风险；代码执行沙箱对场景无用 | 维护性、安全性 |
| **OpenAI Agents SDK（作为主框架）** | 强绑定 OpenAI API，无法自托管模型，隐私合规风险大；中国区 API 稳定性差；缺少 durable execution；Guardrails 思路好但实现太 vendor-locked | 隐私合规、供应商锁定 |
| **Dify（作为生产架构）** | Workflow 表达力不足以支撑复杂分诊逻辑；缺少 RBAC；持久化/scheduling 能力弱；作为原型验证可以，生产架构不行 | 功能上限 |

---

## 7 Deterministic Rules vs LLM 分工

这是宝宝 agent 架构设计中**最关键**的分界线。错误地将 deterministic 任务交给 LLM 是最大的安全风险。

### 7.1 必须走 Deterministic Rules 的功能（禁止 LLM）

| 功能 | 原因 | 实现方式 |
|------|------|---------|
| **红旗症状分诊** | 漏诊/误诊可能危及生命；LLM 可能"编造"安全建议 | 决策树 + 查表（基于 AAP/WHO/中国指南），结果分为"立即急诊/尽快就医/居家观察" |
| **生长曲线 percentile 计算** | 数学计算必须精确；LLM 算数不可靠 | WHO/CDC z-score 查表算法，Python 实现 |
| **corrected age 计算** | 早产儿校正月龄必须精确 | 日期算术，Python 实现 |
| **疫苗接种日程** | 时间间隔和禁忌症有严格医学规定 | 规则表（中国 NIP/WHO EPI），Python 实现 |
| **喂养量/频率异常告警** | 阈值明确（如新生儿 >4h 未进食） | 阈值规则，Python 实现 |
| **用药剂量计算（如有）** | 体重相关剂量计算必须精确 | 公式计算，禁止 LLM |
| **"立即就医"指令** | 必须确定性触发，不能有遗漏 | 硬编码规则 |

### 7.2 适合 LLM 的功能

| 功能 | 原因 | 约束 |
|------|------|------|
| **自然语言对话理解** | 用户输入多样化，需要 NLU | 输出需经 guardrails 过滤 |
| **喂养/睡眠日志的自然语言录入** | "刚喝了 120ml 奶" → 结构化记录 | 提取结果需用户确认 |
| **知识问答**（非紧急） | "6 个月辅食怎么加？" | 基于 RAG 检索，附来源引用，加免责声明 |
| **周/月摘要生成** | "上周睡眠情况总结" | 仅描述事实数据，不做医学判断 |
| **情感支持/焦虑缓解** | 新手父母的非医学情绪需求 | 明确边界：不替代心理咨询 |
| **多语言翻译/适配** | 生成多语言内容 | 医学术语需对照标准翻译 |

### 7.3 灰色地带（需人工审核/保守处理）

| 功能 | 处理策略 |
|------|---------|
| **复合症状组合判断** | Rule engine 先做硬匹配 → 未命中时 LLM 辅助分析 → 但输出必须包含"请咨询医生"且 flag 为 human-review |
| **生长趋势异常但未超阈值** | Rule engine 计算趋势 → LLM 生成解释文字 → 附加"建议下次儿保时讨论" |
| **个性化建议**（如"这个月可以尝试的辅食"） | LLM 生成 → 但必须基于 RAG 检索的权威来源 → 附来源 → 加免责声明 |

---

## 8 风险边界

### 8.1 医疗边界

- **定位**：宝宝 agent 是**育儿记录与信息工具**，不是**医疗诊断系统**。
- 所有健康相关输出必须附加：「以上信息仅供参考，不构成医疗建议。如有健康疑虑，请咨询儿科医生。」
- 红旗症状分诊仅输出"建议就医"级别，不输出诊断。
- **禁止行为**：开药建议、诊断结论、替代医生判断。

### 8.2 隐私边界

- 宝宝数据属于**儿童个人信息**，受以下法规约束：
  - 中国：《个人信息保护法》+ 《儿童个人信息网络保护规定》
  - 欧盟：GDPR（儿童条款 Art. 8）
  - 美国：COPPA（Children's Online Privacy Protection Act）
- **硬约束**：
  - 数据必须加密存储（at rest + in transit）
  - 不得将宝宝数据发送到未经合规认证的第三方 LLM API（这是选型时排除纯 SaaS 方案的主因）
  - 用户必须能完整导出和删除数据
  - 家庭成员访问需明确授权（RBAC）
  - LLM 调用日志需脱敏或本地化存储

### 8.3 框架选型风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LangGraph 重大 breaking change | 编排层需重写 | 抽象 orchestration interface，不直接依赖 LangGraph 内部 API |
| Temporal 运维复杂度超出团队能力 | MVP 延期 | MVP 先用 Inngest/cron，后期迁移 |
| LLM 供应商 API 不稳定/涨价 | 服务中断/成本失控 | 设计模型可切换架构（Semantic Kernel 模式），本地模型作为 fallback |
| 规则引擎维护跟不上指南更新 | 规则过时 | 版本化规则 + 定期对照 WHO/CDC/中国指南更新 |

---

## 9 待验证项

以下内容因信息不足或变化快速，标记为需二次验证：

1. **AutoGen vs AG2 分化状态**（2026 年）：两个分支是否已合并或进一步分化？影响是否推荐。
2. **Semantic Kernel Process Framework 成熟度**（2026 年）：如果其 workflow 编排已足够成熟，可能减少对 Temporal 的依赖。
3. **LangGraph 商业定价**：LangSmith 的商业许可对小团队/个人开发者的成本影响。
4. **Inngest 许可证长期稳定性**：Server Source Available 许可在商业使用中的风险。
5. **国内 LLM API 合规性**：百度文心/阿里通义/DeepSeek 等国内模型 API 在儿童数据处理方面的合规认证情况。
6. **LangGraph + Temporal 集成实践**：是否有成熟的集成模式？需 POC 验证。

---

## 10 结论

### 10.1 核心推荐

宝宝专属 agent 应采用**分层组合架构**，而非单一全能框架：

1. **Orchestration**：**LangGraph** — 图编排 + checkpoint + human-in-the-loop，完美匹配医疗安全场景
2. **Durable Workflow**：**Temporal**（生产）/ **Inngest**（MVP）— 疫苗提醒等长周期任务的可靠 scheduling
3. **Tool/Plugin**：**自建 Python functions**，遵循 Semantic Kernel 的 plugin 设计模式（OpenAPI spec、可审计、可测试）
4. **Rule Engine**：**自建 deterministic Python 模块** — 红旗症状、生长曲线、疫苗日程等**禁止使用 LLM**
5. **RAG/知识检索**：**LangChain 集成的向量检索** — 已在 LangGraph 生态内
6. **安全栅栏**：**自建 guardrails**（借鉴 OpenAI Agents SDK 的设计思路）+ LangGraph HITL 节点
7. **可观测性**：**Langfuse**（开源）或 **LangSmith**（商业）+ **OpenTelemetry**
8. **数据层**：**PostgreSQL** + **向量数据库**（pgvector 或 Qdrant），自托管，加密

### 10.2 一句话总结

> **LangGraph 管"怎么想"，Temporal 管"什么时候做"，自建规则引擎管"什么不能错"，LLM 只负责"怎么说"。**

---

## 参考来源

| 来源 | 链接 |
|------|------|
| LangGraph 官方文档 | https://docs.langchain.com/oss/python/langgraph/overview |
| CrewAI 官方文档 | https://docs.crewai.com/introduction |
| AutoGen (Microsoft) 官方文档 | https://microsoft.github.io/autogen/ |
| OpenAI Agents SDK 文档 | https://openai.github.io/openai-agents-python/ |
| Semantic Kernel 官方文档 | https://learn.microsoft.com/en-us/semantic-kernel/overview/ |
| Dify 官方文档 | https://docs.dify.ai/ |
| Temporal 官方文档 | https://docs.temporal.io/evaluate/why-temporal |
| Inngest 官方文档 | https://www.inngest.com/docs |
| Haystack (deepset) 文档 | https://docs.haystack.deepset.ai/ |
| COPPA 合规指南 | https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa |
| 中国《儿童个人信息网络保护规定》 | http://www.cac.gov.cn/2019-08/23/c_1124913903.htm |
