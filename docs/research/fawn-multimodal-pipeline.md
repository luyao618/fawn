# 08 — 宝宝专属 Agent 多模态摄入与检索管线（D2）

> **文档状态**：`ready_for_review`  
> **任务 ID**：D2  
> **依赖**：A2 ✅ · B1 ✅ · D1 ✅ · E1 ✅ · F1 ✅  
> **下游支撑**：G1（MVP 路线图）  
> **最后更新**：2026-04-12

---

## 1. 执行摘要

本文档定义宝宝 Agent 的多模态管线，覆盖 **图片、视频、音频、文档** 四类输入的摄入、处理、标注、存储、时间线挂载、检索与人工复核。该管线运行在 A2 的“单主 Agent + Temporal workflow + deterministic rule engine + safety_gate”架构下，并继承 B1 的“规则优先、向量兜底”原则，直接复用 D1 中的 `media_asset`、`annotation`、`timeline_event`、`document_chunk`、`embedding`、`citation`、`workflow_run` 等数据模型。

**推荐结论：**

- 采用 **统一摄入网关 + 按模态分支的 Temporal Workflow**。所有媒体统一经过 `upload → validate → transform → inference → candidate_annotation → rule_risk_gate → structured_mapping → timeline/index → human_review` 九阶段。
- 多模态模型与 LLM 只负责 **解析、摘要、候选标签、自然语言解释**；deterministic rules 负责 **阈值、风险分级、路由、权限、删改、升级、发布门禁**。
- 涉及医疗或高风险判断的识别结果，**只能形成候选 annotation，不得直接当作宝宝时间线真相源**。尤其是皮疹识别、哭声/咳嗽判断、发育异常观察、疫苗本/病历/化验单 OCR 等，默认需要人工复核。
- 家庭私有多模态检索与公共知识库检索必须分开；embedding 只做辅助召回，不能替代 L1/L2 规则和已确认结构化事实。

**一句话分工：** 规则决定“能不能写、写到哪、谁能看、是否升级”，模型决定“看到了什么、如何候选描述、如何生成解释文案”。

> **保守边界**：本产品是育儿记录与信息辅助工具，不是诊断系统。任何高风险医疗输出都不应被表述为诊断或治疗建议。

---

## 2. 设计目标与非目标

### 2.1 设计目标

| 编号 | 目标 | 说明 |
|---|---|---|
| G1 | 提供统一摄入接口 | 屏蔽图片/视频/音频/PDF 的格式差异，统一落到 `media_asset` |
| G2 | 保护真相源 | 低置信、多义、医疗高风险结果只停留在 `annotation`/草稿事件，不直接污染高价值子表 |
| G3 | 支撑宝宝时间线 | 多模态结果可回挂 `timeline_event`，与喂养/睡眠/生长/疫苗/症状统一展示 |
| G4 | 支撑检索与引用 | 家庭私有内容可检索、可追溯，且与公共知识库分层隔离 |
| G5 | 满足儿童隐私 | 图片/音频/文档在进入后续阶段前完成脱敏、分级、权限裁切 |
| G6 | 可评测可回放 | 每个阶段可记录 workflow/DB 状态，直接服务 E1 的 tool-call、DB、workflow、privacy/copyright 断言 |

### 2.2 非目标

- **不做医学诊断**：视觉/音频模型不得输出“确诊/排除/用药建议”。
- **不做实时直播处理**：本阶段只支持上传后异步处理，不覆盖流式音视频。
- **不做跨家庭训练数据池**：儿童图片/音频/文档不默认进入公共训练集。
- **不做端侧复杂推理**：本阶段不要求在手机端做重推理，只保留轻量预检能力。

---

## 3. 模态范围与典型宝宝场景

| 场景 | 主模态 | 风险等级 | 推荐处理 |
|---|---|---|---|
| 上传皮疹/湿疹照片，请求记录与咨询 | image | 高 | 仅生成 `skin_*_candidate` 候选标签，强制待人工复核/必要时提示就医 |
| 上传疫苗本、体检单、化验单、处方、出院小结 | image/document | 高 | OCR + 字段抽取 + 来源校验；默认不可自动写入结构化医疗记录 |
| 上传哭声/咳嗽/家长口述音频 | audio | 中 | ASR 与事件切片可辅助记录，但异常判断只能做候选 |
| 上传翻身、爬行、精神状态、喂养过程短视频 | video | 中 | 抽帧 + 音轨分离 + 摘要；只能形成观察候选，不做发育诊断 |
| 上传辅食、便便、尿布、睡眠环境照片 | image | 低-中 | 低风险场景可自动形成 media 事件；异常外观仍应保守升级 |

**本场景的关键难点：**
1. 多模态输入天然含噪声，OCR/ASR/视觉模型容易误识别；
2. 儿童图片/音频隐私敏感度高；
3. 医疗相关媒体的误判代价远高于一般记录类场景；
4. 家长希望“自动化”，但系统必须把“自动候选”与“已确认事实”严格区分。

---

## 4. 总体架构与端到端 Pipeline

### 4.1 总体架构定位

多模态管线作为 A2 架构中的插件/工作流子系统运行：

```text
用户上传媒体
  ↓
主 Agent 识别意图（记录 / 归档 / 咨询 / OCR 提取）
  ↓
MediaIngestionWorkflow (Temporal)
  ├─ preflight_validate
  ├─ malware_scan + dedup
  ├─ transform
  ├─ model_inference
  ├─ candidate_annotation
  ├─ rule_risk_gate
  ├─ structured_mapping
  ├─ timeline_index
  └─ human_review_dispatch
  ↓
D1 schema: media_asset / annotation / timeline_event / document_chunk / embedding / citation / workflow_run
  ↓
safety_gate / review queue / retrieval / follow-up
```

### 4.2 端到端处理链

| 阶段 | 作用 | 主要输出 | 是否可被 LLM 决定 |
|---|---|---|---|
| upload | 接收文件与元数据 | 原始对象、上传上下文 | 否 |
| preflight_validate | 格式、大小、时长、分辨率校验 | 校验结果 | 否 |
| malware_scan + dedup | 安全扫描、hash 去重 | 内容 hash、风险标记 | 否 |
| transform | EXIF 清理、转码、抽帧、重采样 | 标准化派生文件 | 否 |
| model_inference | OCR/ASR/CV/摘要模型推理 | 原始模型输出 | 是，但只生成候选 |
| candidate_annotation | 统一为 annotation | `annotation` 草稿 | 是，但不能直写真相源 |
| rule_risk_gate | 置信阈值、医疗相关性、权限、路由 | 隔离/待复核/可自动通过决策 | 否 |
| structured_mapping | 映射到 timeline/document/候选事件 | `timeline_event`/`document_chunk` 等 | 否 |
| timeline_index | 建 embedding、citation、时间线挂载 | 检索入口 | 否 |
| human_review_dispatch | 进入人工复核/随访 | review/follow-up 任务 | 否 |

### 4.3 推荐默认原则

- **先候选，后确认**：所有模型结果先进入 annotation，而不是直接进入 `growth_event`/`vaccine_event`/`symptom_event`。
- **先隔离，后放行**：疑似证件、病历、多人脸、低清晰度、冲突字段、医疗候选优先 quarantine。
- **先规则，后生成**：风险标签、状态迁移、权限、删除、升级不能交给 LLM。

---

## 5. 各模态处理细节

### 5.1 Image（静态图片）

典型输入：皮疹照片、便便/辅食/尿布照片、睡眠环境照片、体温计屏幕、疫苗本照片。

| 阶段 | 处理内容 |
|---|---|
| 预处理 | EXIF 清理（剥离 GPS 等）；格式标准化；缩略图生成 |
| 人脸检测 | 判断是否有人脸、是否多人脸；仅用于隐私分级与风险路由，不做身份识别 |
| OCR | 对体温计、标签、单据、手写记录做 OCR |
| 分类/候选标注 | 生成 `food_record`、`stool_candidate`、`skin_rash_candidate` 等候选标签 |
| 入库 | 低风险且高置信场景可自动形成 `media` 事件；医疗高风险场景只形成 annotation |
| 风险控制 | `skin_*`、`allergy_*`、`bloody_stool_*` 等类别默认待复核 |

**推荐边界：**
- “辅食照片”“睡眠环境照片”等低风险图片，可自动挂入时间线；
- “皮疹/外伤/发绀/口唇颜色”类图片，不可输出诊断，只能保守提示“请结合症状/必要时就医”。

### 5.2 Video（短视频）

典型输入：翻身、爬行、步态、精神状态、喂养片段。

| 阶段 | 处理内容 |
|---|---|
| 预处理 | 时长校验；抽帧；音轨分离；转码 |
| 视觉摘要 | 对关键帧生成观察摘要 |
| 姿态/动作候选 | `rolling_attempt`、`crawling_candidate`、`feeding_refusal_candidate` 等 |
| 入库 | 原视频写 `media_asset`；关键帧与摘要写 `annotation` |
| 风险控制 | 涉及发育异常/精神差/呼吸异常的候选标签只允许待复核，不允许直接进入症状事实表 |

**推荐边界：** 视频只做“观察候选”，不做“发育评估结论”。

### 5.3 Audio（音频）

典型输入：哭声、咳嗽、喘鸣、家长口述记录。

| 阶段 | 处理内容 |
|---|---|
| 预处理 | 转码、重采样、静音裁剪 |
| ASR | 家长口述转写为 `document_chunk` |
| 事件切片 | 把哭声/咳嗽片段切出，便于后续 review |
| 候选标签 | `crying_candidate`、`cough_candidate`、`wheeze_candidate` 等 |
| 入库 | 原音频写 `media_asset`；ASR 文本写 `document_chunk`；标签写 `annotation` |
| 风险控制 | 异常哭声/咳嗽分类不能直接生成疾病推断；最多触发“建议观察/必要时就医”的保守路径 |

**推荐边界：** 音频模型可帮助“整理线索”，不能替代医生听诊或诊断。

### 5.4 Document（文档/PDF/扫描件）

典型输入：疫苗本、儿保体检单、化验单、病历、处方、出院小结。

| 阶段 | 处理内容 |
|---|---|
| 预处理 | 文本层优先解析；无文本层则走 OCR |
| 字段抽取 | 抽取疫苗名称/日期/剂次、身高体重头围、化验值、药品名称等 |
| 来源校验 | 是否含医院/机构信息、章、条码、日期等 |
| 入库 | 原文写 `media_asset`；抽取文本写 `document_chunk`；引用关系写 `citation` |
| 风险控制 | **所有医疗文档默认 require_human_review=true**；无论置信度多高都不能自动写入高价值医疗事实表 |

**推荐边界：**
- 文档 OCR 可提升录入效率，但不应被当作最终事实源；
- 尤其是化验值、疫苗剂次、用药信息，OCR 一处错位就可能产生严重后果，因此必须人工确认。

---

## 6. Annotation / Tagging 体系

### 6.1 推荐标签分层

| 层级 | 字段 | 典型值 | 说明 |
|---|---|---|---|
| 资产层 | `asset_type` | `image` / `video` / `audio` / `scan_document` / `pdf` | 由规则基于 MIME/magic bytes 确定 |
| 资产层 | `pii_level` | `none` / `low` / `high` / `critical` | 儿童人脸、姓名、病历号等默认高敏感 |
| 资产层 | `face_present` | `true` / `false` / `uncertain` | `uncertain` 自动进待复核 |
| 标注层 | `annotation_type` | `ocr` / `transcript` / `classification` / `medical_ocr` / `document_field` / `symptom_keyword` / `vaccine_record` | 决定后续路由 |
| 标注层 | `producer` | `rule_engine` / `cv_model` / `llm` / `ocr_engine` / `asr_model` / `human` | 明确来源与责任 |
| 标注层 | `confidence` | 0-1 浮点 | 规则/人工产出可固定为 1.0 |
| 标注层 | `reviewer_status` | `auto_approved` / `pending` / `approved` / `rejected` | 医疗相关默认不能 auto_approved |
| 语义层 | `medical_relevance` | `none` / `possible` / `confirmed` | `confirmed` 仅能由人工设置 |
| 语义层 | `timeline_anchor_type` | `exif_datetime` / `ocr_date` / `asr_date` / `user_input` / `inferred` | `inferred` 不能单独驱动高价值事件 |
| 语义层 | `event_candidate_type` | `media_only` / `growth_candidate` / `symptom_candidate` / `vaccine_candidate` / `document_candidate` | 控制映射路径 |
| 语义层 | `source_verified` | `true` / `false` | 文档/单据场景尤其重要 |

### 6.2 推荐不变量

- `annotation_type` 含 `medical_*`、`vaccine_*`、`document_field` 时，`reviewer_status` 默认 `pending`。
- `producer = human` 时，标注默认 `approved`。
- 同一 `media_asset` 上同一语义字段若存在冲突，必须进 conflict review，而不是覆盖旧值。

---

## 7. 时间线映射与真相源分层

### 7.1 哪些内容只能形成 media 事件

以下内容可自动形成 `timeline_event(type=media)`，但不应进入高价值事实表：
- 辅食照片
- 睡眠环境照片
- 一般活动短视频
- 家长口述音频及其转写
- 一般文档归档

### 7.2 哪些内容只能形成候选事件

以下内容最多形成 `growth_candidate` / `symptom_candidate` / `vaccine_candidate` / `document_candidate`：
- 体检单 OCR 提取出的身高/体重/头围
- 疫苗本 OCR 提取出的疫苗名称/日期/剂次
- 皮疹/咳嗽/喘鸣/精神差等医疗相关候选标签
- 视频中的翻身/步态/动作不对称候选观察

### 7.3 哪些内容必须人工确认后才能写入高价值子表

| 目标子表 | 必须人工确认的输入 |
|---|---|
| `growth_event` | 来自文档 OCR 的身高/体重/头围数值 |
| `vaccine_event` | 疫苗本/接种记录中的疫苗名称、剂次、日期、批号 |
| `symptom_event` | 皮疹/咳嗽/呼吸异常/神志异常等候选标签 |
| `follow_up_task` | 基于医疗候选自动生成的随访建议 |

### 7.4 真相源保护策略

- 候选事件进入 `timeline_event` 时，应标记为草稿态或 pending，不参与规则引擎主判断。
- 低置信结果不能直接写入 `growth_event`/`vaccine_event`/`symptom_event`。
- 时间锚点如果仅来自 `inferred`，不能单独驱动医疗类高价值事件。
- 同日同类型若已有 confirmed 事件，新候选需走 conflict review。

**推荐结论：** 把时间线当“统一挂载层”，把高价值子表当“已确认事实层”，二者不能混用。

---

## 8. 检索 / RAG / 引用与权限边界

### 8.1 双库隔离

| 检索域 | 数据来源 | 权限边界 |
|---|---|---|
| 家庭私有媒体库 | `media_asset`、`annotation`、`document_chunk` | 仅当前家庭可检索；Viewer 只看脱敏摘要 |
| 公共知识库 | 指南、标准、百科、规则引用 | 不得混入家庭原始媒体 |

### 8.2 检索原则

1. 多模态 embedding **只做候选召回**，不做最终事实判定。  
2. 已确认结构化事实（如 `growth_event`、`vaccine_event`）优先于向量召回结果。  
3. 公共知识引用与家庭私有引用必须分别展示，避免把 OCR 候选误包装成“权威来源”。  
4. Viewer 角色不能通过检索获取原始病历、原图、完整对话，只能看到最小必要摘要。

### 8.3 与 B1/F1 的衔接

- B1 要求“规则优先、向量兜底”，因此多模态召回只能作为 L3/L4 风格的辅助层。  
- F1 要求儿童数据从严，因此私有媒体 embedding 不应用作跨家庭全局索引。  
- 医疗相关回复若引用家庭上传文档，应清楚标注“家庭上传记录，待人工复核/非权威诊断依据”。

---

## 9. 低置信、人工复核与隔离 / Quarantine

### 9.1 自动隔离触发条件

以下任一命中时，`media_asset.status` 应进入 `quarantined` 或等价隔离态：

- 检测到多人脸或人脸识别不确定；
- `pii_level` 为 `high/critical`；
- OCR 命中病历、疫苗本、处方、化验单模板；
- 任意关键 annotation 的 `confidence` 低于保守阈值；
- 图片模糊/遮挡严重；
- 同一资产上关键字段冲突（如 OCR 日期与用户输入日期冲突）；
- 命中 `medical_relevance = possible`。

### 9.2 人工复核流程

1. 进入 review queue；  
2. 由有权限的家庭管理员/运营/人工复核角色查看；  
3. 可选择 `approve / reject / edit_then_approve`；  
4. 被 reject 的资产不进入检索与时间线主视图；  
5. 长期未复核的高风险资产可提醒，但不应自动放行。

### 9.3 推荐阈值策略

- 低风险场景可有较宽的自动通过阈值；
- 医疗高风险场景不建议使用“高置信自动通过”；
- 具体阈值、模型版本、文档模板识别范围应配置化，并在实现前走人工确认。

> **待人工复核**：OCR/ASR/视觉模型阈值（如 0.90/0.92/0.95）不应在研究文档中写死为最终上线值。

---

## 10. Deterministic Rules vs LLM 分工矩阵

| 职责 | 推荐执行者 | 说明 |
|---|---|---|
| MIME 类型判断、尺寸/时长校验、恶意文件扫描 | Deterministic rules | 基础安全与格式校验，不能交给 LLM |
| PII 分级、证件/病历模板命中、权限过滤 | Deterministic rules | 涉及隐私与合规，LLM 无决定权 |
| 置信阈值路由、quarantine、状态迁移 | Deterministic rules | 决定是否待复核/是否可见 |
| 候选事件能否写入高价值子表 | Deterministic rules + 人工 | 高风险场景必须人工确认 |
| 图片/视频/音频/文档内容理解 | CV/ASR/OCR/LLM | 仅形成候选标签与摘要 |
| 自然语言解释、家长可读摘要 | LLM | 但必须经过 safety_gate |
| 删除、导出、权限变更、Viewer 投影 | Deterministic rules | 不能交给模型“判断是否合理” |
| 发布门禁、评测断言 | Deterministic rules + E1 harness | 高风险不能用 LLM-as-judge |

**总原则：** LLM 负责“理解与表达”，规则负责“决策与约束”。

---

## 11. Trade-off 与推荐默认方案

### 11.1 关键 trade-off

| 议题 | 方案 A | 方案 B | 推荐 |
|---|---|---|---|
| 低风险图片是否自动入时间线 | 全部人工 | 低风险自动、医疗高风险待复核 | **推荐 B**，兼顾效率与安全 |
| 医疗文档 OCR 是否自动写结构化事实 | 自动写入 | 一律人工确认后写入 | **推荐后一项**，更保守 |
| 多模态 embedding 是否作为主检索 | 向量优先 | 结构化事实/规则优先，向量兜底 | **推荐后者** |
| 家庭媒体是否参与公共模型训练 | 默认参与 | 默认不参与，仅显式 opt-in | **推荐后者** |
| 视频/音频异常判断 | 模型直接给结论 | 模型给候选，规则/人工做最终裁决 | **推荐后者** |

### 11.2 推荐默认方案

1. **MVP 只做“自动候选 + 人工确认”闭环，不做自动医疗结论。**  
2. **文档类一律保守**：病历、疫苗本、处方、化验单默认待人工复核。  
3. **家庭私有检索与公共知识检索彻底分离。**  
4. **低风险记录类可部分自动化，高风险医疗类必须规则化。**

### 11.3 明确不推荐做法

- 让视觉模型直接判断“是不是湿疹/肺炎/过敏性休克”；
- 让 OCR 自动把疫苗剂次、药品剂量写进正式医疗记录；
- 让 embedding 相似度覆盖已确认结构化事实；
- 让 Viewer 看原始病历、原图、完整敏感对话；
- 让 LLM 决定是否隔离、是否升级、是否删除、是否放行。

---

## 12. MVP 与后续阶段建议

### 12.1 MVP（必须做）

- 图片/音频/文档上传与统一入库；
- `media_asset` + `annotation` + `timeline_event(media)` 基础链路；
- OCR/ASR 基础能力；
- quarantine + human review 队列；
- 文档类与医疗候选默认待复核；
- 基础 embedding 与家庭私有检索；
- 与 E1 对齐的高风险断言与回归门禁。

### 12.2 Post-MVP（可后做）

- 视频关键帧更细的动作候选；
- 多模态摘要合并（图+音+文联合摘要）；
- 更完善的 conflict review 与多版本比较；
- 面向运营/人工复核的效率工具。

### 12.3 暂不建议纳入近期范围

- 自动疾病识别；
- 自动发育迟缓判断；
- 跨国家复杂医疗文档模板全覆盖；
- 端侧复杂多模态推理。

---

## 13. 待人工复核 / 二次验证事项

1. OCR/ASR/CV 模型阈值与 auto-approve 门槛；  
2. 各类病历/疫苗本/化验单模板覆盖范围与许可边界；  
3. 儿童图片/音频云端处理的地区合规要求；  
4. 第三方模型/SDK 的许可、数据保留与训练条款；  
5. 视频抽帧率、音频切片策略、review SLA；  
6. 医疗候选标签词表与升级策略；  
7. Viewer 脱敏摘要粒度在不同地区/法务口径下的差异。

这些事项不影响当前 D2 作为**研究设计与实现约束文档**进入 review，但在落地前必须人工确认，不能直接视作上线参数。

---

## 14. 结论

宝宝 Agent 的多模态能力，正确方向不是“让模型直接看图听音给答案”，而是：

- 用统一管线把多模态输入转成 **可审计的候选信息**；
- 用规则与人工复核守住 **医疗、隐私、权限、删除、发布门禁**；
- 用时间线与检索把媒体变成 **可回顾、可追溯、可复用** 的家庭资料；
- 把“自动化”限制在低风险记录与整理，把高风险判断留给规则与人。

**最终推荐**：D2 采用“统一摄入网关 + Temporal workflow + annotation 候选层 + 真相源分层 + quarantine/review 队列”的保守方案。它既能支持宝宝场景下的记录效率提升，又不越过 F1 定义的医疗与隐私边界，并可直接作为 G1 MVP 路线图的实现输入。
