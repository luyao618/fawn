# 07 — 宝宝专属 Agent 数据库 Schema 草案（D1，修订版）

> 面向“宝宝专属 agent”的数据库设计：支撑喂养/睡眠/生长/疫苗/症状、家庭多成员协作、多模态、RAG 检索、审计与儿童隐私合规，并直接作为 E1（eval harness）、D2（多模态管线）、G1（MVP roadmap）的数据底座。

---

## 1. 设计目标与推荐结论

### 1.1 设计目标
1. 以 **宝宝时间线** 为中心统一承载喂养、睡眠、生长、疫苗、症状、提醒、随访与多模态记录。
2. 让 **deterministic rules** 能直接读取关键结构化字段，不依赖 LLM 作高风险判断。
3. 让 **LLM/RAG** 只承担解析、摘要、解释、检索增强，不掌握医疗/权限/删除的最终决策权。
4. 满足儿童隐私、家庭 RBAC、consent、审计、删除/保留、版权许可边界。
5. 支撑 Temporal workflow、回放评测、幂等、告警、随访与版本化知识引用。

### 1.2 推荐默认方案
- **PostgreSQL**：唯一事实主库，存强结构化数据、关系、权限、审计、工作流落表、检索元数据。
- **Redis**：只存缓存、会话热状态、短期幂等窗口、速率限制，不存主事实数据。
- **Object Storage**：图片/音频/视频/扫描件/OCR 原件与中间结果。
- **Vector Index / pgvector**：仅服务语义检索，不承载权限、审计与真相源。
- **统一 `timeline_event` + 高价值子表**：时间线统一，规则字段强结构化，其他扩展走 JSONB。

### 1.3 不推荐做法
- 纯 JSON 文档库存主数据。
- Redis 作为健康/疫苗/症状主存储。
- 只有向量库、没有主库溯源锚点。
- 让 LLM 直接决定红旗症状、权限放行、删除审批。
- Viewer 直接读取完整敏感对话与原始症状描述。

---

## 2. 存储分层职责边界

| 存储 | 职责 | 典型内容 | 不该承担 |
|---|---|---|---|
| PostgreSQL | 主事实库、关系、事务、审计、权限、工作流、引用 | family、baby_profile、timeline_event、vaccine_event、audit_log | 大文件原件、长时向量检索主逻辑 |
| Redis | 热缓存、session 状态、短 TTL 幂等、限流 | active_session、rate_limit、idempotency cache | 长期健康记录、审计日志 |
| Object Storage | 原始媒体与派生文件 | image/audio/video/scan、OCR JSON、ASR 文本 | RBAC 主判定、结构化真相源 |
| Vector Index | 语义召回 | document_chunk embedding、家庭摘要 embedding | 权限、删除、审计主逻辑 |

**结论**：以 PostgreSQL 作为唯一真相源；Redis/对象存储/向量索引均为辅助层。

---

## 3. 逻辑域与核心关系

```text
Family 1—N Member
Family 1—N BabyProfile
BabyProfile 1—N ConversationSession
BabyProfile 1—N TimelineEvent
TimelineEvent 1—0..1 FeedingEvent / GrowthEvent / SleepEvent / VaccineEvent / SymptomEvent
TimelineEvent 1—N MediaAsset
MediaAsset 1—N Annotation
TimelineEvent 0..N Reminder
TimelineEvent 0..N FollowUpTask
WorkflowRun 1—N Reminder / FollowUpTask / TimelineEvent
ScheduledJob 1—N WorkflowRun
IdempotencyKey N—1 WorkflowRun
SourceRegistry 1—N DocumentChunk
DocumentChunk 1—N Citation
Consent N—1 Member / N—1 BabyProfile
AuditLog 记录全部读写/授权/导出/删除/规则命中
RetentionDeletionPolicy 约束数据生命周期
```

---

## 4. 统一时间线方案与拆表原则

### 4.1 为什么保留 `timeline_event`
统一时间线对宝宝 agent 很关键：
- 家长看到的是连续生活流，不是分散的表。
- E1 需要重放某个时间段内的完整事件链。
- D2 多模态结果需要回挂到同一时间线。
- 审计与删除策略需要统一锚点。

### 4.2 为什么再加高价值子表
仅有 JSONB 不足以支撑：
- 生长规则：需要直接读取身高/体重/头围/z-score。
- 症状规则：需要直接读取 onset、severity、temperature、red_flag 命中。
- 疫苗排程：需要 dose_no、schedule_code、status、due_date。
- 睡眠/喂养分析：需要高频聚合查询。

**推荐原则**：
- 时间线统一放 `timeline_event`。
- 规则与评测需要的“金字段”放强结构化子表。
- 低频、非核心、可扩展字段放 JSONB。

---

## 5. 主 Schema（字段级说明）

## 5.1 家庭与身份域

### family
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 家庭唯一标识 |
| display_name | TEXT | 家庭显示名 |
| region_code | TEXT | 地区，用于疫苗/合规/默认规则选择 |
| timezone | TEXT | 时区 |
| status | ENUM(active, suspended, deleted) | 家庭状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### member
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 成员 id |
| family_id | UUID FK | 所属家庭 |
| role | ENUM(primary_guardian, co_guardian, viewer) | 家庭角色 |
| display_name | TEXT | 昵称 |
| phone_or_email | TEXT(加密) | 联系方式 |
| auth_subject | TEXT | 外部认证主体 |
| status | ENUM(active, pending, removed) | 状态 |
| last_login_at | TIMESTAMP | 最后登录 |
| created_at | TIMESTAMP | 创建时间 |

### baby_profile
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 宝宝 id |
| family_id | UUID FK | 所属家庭 |
| name | TEXT(加密) | 宝宝姓名/昵称 |
| dob | DATE(加密) | 出生日期 |
| gestational_age_weeks | SMALLINT | 胎龄，用于 corrected age |
| sex | ENUM | 生理性别/登记性别 |
| birth_weight_kg | NUMERIC(5,2)(加密) | 出生体重 |
| birth_height_cm | NUMERIC(5,2)(加密) | 出生身长 |
| birth_head_circ_cm | NUMERIC(5,2)(加密) | 出生头围 |
| avatar_asset_id | UUID FK NULL | 头像媒体 |
| status | ENUM(active, archived, deleted) | 状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

---

## 5.2 会话与统一时间线域

### conversation_session
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 会话 id |
| family_id | UUID FK | 家庭 id |
| baby_id | UUID FK NULL | 关联宝宝 |
| member_id | UUID FK | 发起成员 |
| channel | ENUM(app, web, wechat, api) | 来源渠道 |
| session_type | ENUM(chat, quick_log, workflow_followup) | 会话类型 |
| started_at | TIMESTAMP | 开始时间 |
| closed_at | TIMESTAMP NULL | 结束时间 |
| summary_text | TEXT | 会话摘要；Viewer 默认只读此字段 |
| risk_level | ENUM(p0,p1,p2,p3) | 会话最高风险级别 |
| created_at | TIMESTAMP | 创建时间 |

### timeline_event
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主事件 id |
| family_id | UUID FK | 家庭 id |
| baby_id | UUID FK | 宝宝 id |
| session_id | UUID FK NULL | 来源会话 |
| event_type | ENUM(feeding,growth,sleep,vaccine,symptom,media,annotation,reminder,follow_up,workflow_marker) | 事件类型 |
| occurred_at | TIMESTAMP | 事件发生时间 |
| recorded_at | TIMESTAMP | 入库时间 |
| created_by | UUID FK | 创建成员/系统 |
| subtable_name | TEXT NULL | 对应子表名 |
| subtable_id | UUID NULL | 对应子表主键 |
| payload_snapshot | JSONB | 供时间线快速展示的脱敏快照 |
| source_type | ENUM(user, device, clinic, workflow, llm_parse) | 数据来源 |
| risk_level | ENUM(p0,p1,p2,p3,none) | 事件风险 |
| is_red_flag | BOOLEAN | 是否命中红旗规则 |
| rule_ids_triggered | TEXT[] | 命中规则 id |
| workflow_run_id | UUID FK NULL | 若由 workflow 产生 |
| deleted_at | TIMESTAMP NULL | 软删除时间 |
| partition_month | DATE | 月分区锚点，取当月 1 日 |

> `timeline_event` 保证统一回放与审计；`payload_snapshot` 只存最小必要摘要，不替代强结构化子表。

---

## 5.3 高价值事件子表

### feeding_event
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| timeline_event_id | UUID FK UNIQUE | 对应 timeline_event |
| baby_id | UUID FK | 宝宝 id |
| feeding_mode | ENUM(breast, formula, mixed, solid, water, medicine_carrier) | 喂养方式 |
| amount | NUMERIC(6,2) NULL | 数值 |
| unit | TEXT NULL | ml/g/oz 等 |
| side | ENUM(left,right,both) NULL | 母乳侧别 |
| duration_min | INTEGER NULL | 时长 |
| food_type | TEXT NULL | 辅食类型 |
| reaction_flags | TEXT[] | 吐奶/拒食/过敏等 |
| note | TEXT NULL | 备注 |
| created_at | TIMESTAMP | 创建时间 |

### growth_event
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| timeline_event_id | UUID FK UNIQUE | 对应 timeline_event |
| baby_id | UUID FK | 宝宝 id |
| measured_at | TIMESTAMP | 测量时间 |
| chronological_age_days | INTEGER | 实际日龄 |
| corrected_age_days | INTEGER NULL | 早产校正日龄 |
| age_used_days | INTEGER | 实际用于查表的年龄 |
| weight_kg | NUMERIC(5,2)(加密) | 体重 |
| height_cm | NUMERIC(5,2)(加密) | 身长/身高 |
| head_circ_cm | NUMERIC(5,2)(加密) | 头围 |
| measurement_position | ENUM(supine, standing, unknown) NULL | 测量姿态 |
| weight_zscore | NUMERIC(5,2) NULL | 体重 z-score |
| height_zscore | NUMERIC(5,2) NULL | 身高 z-score |
| head_circ_zscore | NUMERIC(5,2) NULL | 头围 z-score |
| weight_percentile | NUMERIC(5,1) NULL | 体重百分位 |
| height_percentile | NUMERIC(5,1) NULL | 身高百分位 |
| head_circ_percentile | NUMERIC(5,1) NULL | 头围百分位 |
| bmi | NUMERIC(4,1) NULL | BMI（适用年龄才计算） |
| bmi_zscore | NUMERIC(5,2) NULL | BMI z-score |
| bmi_percentile | NUMERIC(5,1) NULL | BMI 百分位 |
| wfl_zscore | NUMERIC(5,2) NULL | weight-for-length/height z-score |
| wfl_percentile | NUMERIC(5,1) NULL | weight-for-length/height 百分位 |
| percentile_json | JSONB | percentile / meta 汇总结果 |
| standard_source | ENUM(who, cdc, cn_nhc, custom, fenton) | 标准来源 |
| standard_version | TEXT NULL | 标准版本 |
| alert_level | ENUM(normal, watch, review, urgent) NULL | 风险分级 |
| alert_details | JSONB NULL | 告警细节 |
| trend_flag | ENUM(stable, crossing_up, crossing_down, rapid_change, insufficient_data) NULL | 趋势标记 |
| trend_details | JSONB NULL | 趋势细节 |
| measured_by | ENUM(home, clinic, hospital, device, parent) | 测量来源 |
| engine_version | TEXT NULL | 规则引擎版本 |
| computed_at | TIMESTAMP NULL | 规则计算时间 |
| is_outlier | BOOLEAN | 是否超阈值 |
| note | TEXT NULL | 备注 |
| created_at | TIMESTAMP | 创建时间 |

### sleep_event
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| timeline_event_id | UUID FK UNIQUE | 对应 timeline_event |
| baby_id | UUID FK | 宝宝 id |
| sleep_start_at | TIMESTAMP | 入睡时间 |
| sleep_end_at | TIMESTAMP | 醒来时间 |
| duration_min | INTEGER | 时长 |
| sleep_type | ENUM(night, nap, contact_nap, unknown) | 睡眠类型 |
| wake_count | SMALLINT NULL | 夜醒次数 |
| settling_method | TEXT NULL | 哄睡方式 |
| quality_score | SMALLINT NULL | 质量评分 |
| note | TEXT NULL | 备注 |
| created_at | TIMESTAMP | 创建时间 |

### vaccine_event
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| timeline_event_id | UUID FK UNIQUE | 对应 timeline_event |
| baby_id | UUID FK | 宝宝 id |
| schedule_region | TEXT | 适用地区，如 CN / US |
| vaccine_code | TEXT | 疫苗编码 |
| vaccine_name | TEXT(加密) | 疫苗名 |
| dose_no | SMALLINT | 第几剂 |
| dose_series_key | TEXT | 同系列逻辑键 |
| scheduled_at | TIMESTAMP NULL | 计划接种时间 |
| reminder_dates | JSONB NULL | 计划提醒时间列表 |
| administered_at | TIMESTAMP NULL | 实际接种时间 |
| provider_name | TEXT(加密) NULL | 机构名 |
| batch_no | TEXT(加密) NULL | 批号 |
| status | ENUM(scheduled, reminded, given, overdue, deferred, contraindicated, skipped_by_parent) | 剂次主状态 |
| defer_reason | TEXT NULL | 延期原因 |
| defer_until | TIMESTAMP NULL | 延期至 |
| contraindication_note | TEXT NULL | 禁忌说明 |
| skip_reason | TEXT NULL | 家长跳过原因 |
| catch_up_from_event_id | UUID NULL | 补种来源 event |
| adverse_event_flag | BOOLEAN | 是否有不良反应 |
| reminder_id | UUID FK NULL | 最近一次关联提醒 |
| note | TEXT NULL | 备注 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
+
+> 说明：`ADVERSE_EVT`、`FOLLOW_UP`、`CLOSED` 在 C2 中属于**接种后不良反应与随访闭环状态**，其主落点不是 `vaccine_event.status`，而是 `symptom_event + follow_up_task + workflow_run`。因此 `vaccine_event.status` 仅保存“该剂次的主业务状态”；随访子状态在关联表中表达。

### symptom_event
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| timeline_event_id | UUID FK UNIQUE | 对应 timeline_event |
| baby_id | UUID FK | 宝宝 id |
| onset_at | TIMESTAMP NULL | 起始时间 |
| reported_at | TIMESTAMP | 报告时间 |
| symptom_code | TEXT | 结构化症状编码 |
| symptom_text | TEXT(加密) | 原始描述 |
| body_temperature_c | NUMERIC(4,1) NULL | 体温 |
| severity | ENUM(mild, moderate, severe, red_flag) | 严重度 |
| duration_hours | NUMERIC(6,1) NULL | 持续时长 |
| intake_reduced | BOOLEAN NULL | 是否拒食/进食减少 |
| breathing_issue | BOOLEAN NULL | 是否呼吸困难 |
| vomiting_flag | BOOLEAN NULL | 是否呕吐 |
| stool_blood_flag | BOOLEAN NULL | 是否血便 |
| seizure_flag | BOOLEAN NULL | 是否抽搐 |
| rule_evaluation | JSONB | 规则判定细节 |
| requires_follow_up | BOOLEAN | 是否需随访 |
| note | TEXT NULL | 备注 |
| created_at | TIMESTAMP | 创建时间 |

**结论**：growth/sleep/vaccine/symptom 采用强结构化子表，达到规则引擎、评测与统计所需粒度；其余边缘字段留给 JSONB/备注。

---

## 5.4 工作流、提醒与幂等域

### reminder
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 提醒 id |
| family_id | UUID FK | 家庭 id |
| baby_id | UUID FK | 宝宝 id |
| reminder_type | ENUM(vaccine_due, growth_check, follow_up, feeding_check, sleep_check, custom) | 提醒类型 |
| target_event_type | TEXT NULL | 关联事件类型 |
| target_event_id | UUID NULL | 关联事件 |
| due_at | TIMESTAMP | 计划触发时间 |
| channel | ENUM(in_app, push, sms, wechat) | 触达渠道 |
| template_key | TEXT | 模板键 |
| rendered_summary | TEXT | 展示摘要 |
| status | ENUM(pending, sent, acknowledged, expired, cancelled) | 状态 |
| workflow_run_id | UUID FK NULL | 来源 workflow |
| created_by | UUID FK | 创建者 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### follow_up_task
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 随访任务 id |
| family_id | UUID FK | 家庭 id |
| baby_id | UUID FK | 宝宝 id |
| source_event_type | TEXT | 来源事件类型 |
| source_event_id | UUID | 来源事件 id |
| purpose | ENUM(symptom_recheck, vaccine_adverse_check, growth_remeasure, manual_followup) | 目的 |
| due_at | TIMESTAMP | 截止时间 |
| assigned_to | UUID FK NULL | 指派成员 |
| status | ENUM(open, in_progress, completed, escalated, expired, cancelled) | 状态 |
| escalation_level | ENUM(none, p1, p0) | 升级等级 |
| completion_summary | TEXT NULL | 完成摘要 |
| workflow_run_id | UUID FK NULL | 来源 workflow |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### workflow_run
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | workflow 实例 id |
| workflow_type | ENUM(vaccine_reminder, follow_up, retention, growth_check, export_approval, catch_up) | workflow 类型 |
| external_engine | ENUM(temporal, internal_scheduler) | 执行引擎 |
| external_workflow_id | TEXT NULL | Temporal workflow id（业务稳定标识） |
| external_run_id | TEXT NULL | Temporal run id（单次执行标识） |
| correlation_id | TEXT NULL | 关联一次请求/会话链路 |
| command_id | TEXT NULL | 触发该 workflow 的命令 id |
| workflow_business_id | TEXT NULL | 幂等业务标识 |
| family_id | UUID FK | 家庭 id |
| baby_id | UUID FK NULL | 宝宝 id |
| trigger_mode | ENUM(schedule, event, manual, retry) | 触发方式 |
| trigger_event_id | UUID NULL | 触发该 workflow 的事件 |
| input_snapshot | JSONB | 入参快照 |
| output_snapshot | JSONB NULL | 结果快照 |
| status | ENUM(pending_start, running, completed, failed, cancelled, timed_out, orphaned) | 状态 |
| idempotency_scope | TEXT NULL | 幂等作用域 |
| started_at | TIMESTAMP NULL | 开始时间 |
| finished_at | TIMESTAMP NULL | 结束时间 |
| created_at | TIMESTAMP | 创建时间 |
+
+> 约束：LangGraph 不得直接绕过 `workflow_run` 表启动 Temporal。任何 durable workflow 都必须先写 `workflow_run + idempotency_key`，再通过 workflow bridge/outbox 发起，以确保 DB 与 Temporal 可 reconciliation。

### scheduled_job
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 调度记录 id |
| workflow_type | TEXT | 对应 workflow |
| family_id | UUID FK NULL | 家庭范围 |
| baby_id | UUID FK NULL | 宝宝范围 |
| cron_expr | TEXT NULL | cron 表达式 |
| next_run_at | TIMESTAMP NULL | 下次执行 |
| last_run_at | TIMESTAMP NULL | 上次执行 |
| timezone | TEXT | 时区 |
| status | ENUM(active, paused, completed, failed) | 状态 |
| config_snapshot | JSONB | 调度配置 |
| created_at | TIMESTAMP | 创建时间 |

### idempotency_key
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 主键 |
| family_id | UUID FK | 家庭 id |
| operation_name | TEXT | 操作名，如 create_vaccine_reminder |
| idempotency_key | TEXT UNIQUE | 幂等键 |
| request_hash | TEXT | 请求摘要 |
| workflow_run_id | UUID FK NULL | 对应 workflow |
| first_seen_at | TIMESTAMP | 首次见到 |
| expires_at | TIMESTAMP | 过期时间 |
| status | ENUM(active, consumed, expired) | 状态 |

---

## 5.5 多模态域

### media_asset
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 媒体 id |
| family_id | UUID FK | 家庭 id |
| baby_id | UUID FK NULL | 宝宝 id |
| timeline_event_id | UUID FK NULL | 回挂时间线 |
| asset_type | ENUM(image, audio, video, scan, document) | 资产类型 |
| object_url | TEXT | 对象存储地址 |
| content_hash | TEXT | 去重 hash |
| mime_type | TEXT | MIME |
| captured_at | TIMESTAMP NULL | 采集时间 |
| uploaded_by | UUID FK | 上传成员 |
| pii_level | ENUM(low, medium, high) | 敏感等级 |
| face_present | BOOLEAN | 是否有人脸 |
| transcript_text | TEXT(加密) NULL | ASR/OCR 文本 |
| status | ENUM(active, quarantined, deleted) | 状态 |
| created_at | TIMESTAMP | 创建时间 |

### annotation
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 标注 id |
| media_asset_id | UUID FK | 媒体 id |
| annotation_type | ENUM(ocr, bbox, transcript, classification, manual_note) | 类型 |
| producer | ENUM(model, human, workflow) | 产生方式 |
| confidence | NUMERIC(4,3) NULL | 置信度 |
| payload | JSONB | 标注内容 |
| reviewer_status | ENUM(pending, accepted, rejected) | 复核状态 |
| created_at | TIMESTAMP | 创建时间 |

---

## 5.6 检索/RAG/来源治理域

### source_registry
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 来源 id |
| source_tier | ENUM(L1,L2,L3,L4,L5,L6) | 知识层级 |
| title | TEXT | 来源标题 |
| canonical_url | TEXT NULL | 原始 URL |
| publisher | TEXT | 发布方 |
| region_scope | TEXT | 地区适用范围，如 CN/US/Global |
| medical_scope | TEXT | 适用主题 |
| version_label | TEXT NULL | 版本标签 |
| effective_from | DATE NULL | 生效起始 |
| effective_to | DATE NULL | 生效截止 |
| license_type | TEXT NULL | 许可类型 |
| license_status | ENUM(allowed, review_needed, prohibited, expired) | 许可状态 |
| can_store_fulltext | BOOLEAN | 可否全文入库 |
| citation_requirement | TEXT NULL | 最低引用要求 |
| notes | TEXT NULL | 备注 |
| updated_at | TIMESTAMP | 更新时间 |

### document_chunk
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | chunk id |
| source_registry_id | UUID FK | 来源 |
| chunk_type | ENUM(rule, guideline, encyclopedia, family_memory, qa_summary) | 类型 |
| content | TEXT | 内容 |
| chunk_hash | TEXT | 去重 hash |
| token_count | INTEGER | token 数 |
| created_at | TIMESTAMP | 创建时间 |

### embedding
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | embedding id |
| document_chunk_id | UUID FK | 对应 chunk |
| vector_ref | TEXT / VECTOR | 向量或向量引用 |
| model_name | TEXT | embedding 模型 |
| created_at | TIMESTAMP | 创建时间 |

### citation
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 引用 id |
| source_registry_id | UUID FK | 来源 |
| document_chunk_id | UUID FK | chunk |
| target_type | ENUM(reply, timeline_summary, eval_case, note) | 被引用目标类型 |
| target_id | UUID | 被引用对象 |
| quote_span | TEXT NULL | 引用片段范围 |
| citation_text | TEXT NULL | 展示给用户的引用文本 |
| geo_scope_snapshot | TEXT NULL | 引用时地区快照 |
| license_status_snapshot | TEXT | 引用时许可快照 |
| created_at | TIMESTAMP | 创建时间 |

**版权边界**：许可不明时只登记 metadata，不默认全文入库；高风险医学回答必须可追溯到 citation。

---

## 5.7 安全、权限、审计与生命周期域

### consent
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | consent id |
| family_id | UUID FK | 家庭 id |
| member_id | UUID FK | 被授权人 |
| baby_id | UUID FK NULL | 作用宝宝 |
| consent_type | ENUM(data_access, export, delete, viewer_scope, research_opt_in) | 类型 |
| scope_json | JSONB | 授权范围 |
| granted_by | UUID FK | 授权人 |
| granted_at | TIMESTAMP | 授权时间 |
| expires_at | TIMESTAMP NULL | 过期时间 |
| revoked_at | TIMESTAMP NULL | 撤销时间 |
| status | ENUM(active, expired, revoked) | 状态 |

### audit_log
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 审计 id |
| family_id | UUID FK | 家庭 id |
| member_id | UUID FK NULL | 发起人 |
| action | ENUM(read, write, update, delete, export, auth_change, rule_trigger, safety_block, workflow_run) | 行为 |
| subject_type | TEXT | 作用对象类型 |
| subject_id | UUID NULL | 作用对象 id |
| risk_level | ENUM(p0,p1,p2,p3,none) | 风险级别 |
| metadata | JSONB | 结构化明细 |
| created_at | TIMESTAMP | 时间 |

### retention_deletion_policy
| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID PK | 策略 id |
| family_id | UUID FK | 家庭 id |
| object_type | TEXT | 对象类型 |
| object_id | UUID NULL | 对象 id；为空表示类型级策略 |
| retention_class | ENUM(hot_12m, cold_archive, legal_hold, delete_after_90d, keep_until_manual_delete) | 保留类别 |
| retention_until | TIMESTAMP NULL | 保留至 |
| deletion_mode | ENUM(soft_delete, hard_delete, anonymize) | 删除方式 |
| delete_requested_by | UUID FK NULL | 发起人 |
| delete_requested_at | TIMESTAMP NULL | 发起时间 |
| executed_at | TIMESTAMP NULL | 执行时间 |
| status | ENUM(active, scheduled, executed, cancelled) | 状态 |

---

## 6. 分区、冷热归档、级联删除与保留策略

### 6.1 分区建议
**推荐**：`timeline_event` 按 `partition_month` 月分区；主索引含 `(baby_id, occurred_at desc)` 与 `(family_id, occurred_at desc)`。

**为什么不是按 baby_id 单独分区？**
- baby 数量通常有限，按 baby 分区会造成大量小分区，不利于运维。
- 月分区更适合时间线、归档、删除与 replay。

**为什么仍保留 baby_id 联合索引？**
- 多数查询是“某宝宝近 30/90 天事件流”。

### 6.2 冷热分层
- 热数据：近 12 个月 timeline_event + 高价值子表留主库热分区。
- 冷数据：12 个月前迁入冷分区/归档库，但保留可检索摘要与 audit 锚点。
- 对话原文默认 90 天后摘要化；结构化事件与审计照常保留。

### 6.3 删除级联原则
- `timeline_event` 软删时：对应子表同步标记，不立刻物理删除。
- 触发硬删时：
  - 健康/身份敏感字段执行硬删或匿名化；
  - `audit_log` 不删，只保留最小必要元数据；
  - `citation` 保留引用锚点，但去掉敏感展示文本；
  - `workflow_run` 保留执行外壳与状态，用于合规追溯；
  - `media_asset` 删除对象存储原件后，保留 tombstone 记录。

### 6.4 推荐删除策略
- viewer 误操作：软删 + 90 天恢复窗。
- primary_guardian 发起正式删除：走 consent + 审批 + 审计链。
- 法规要求最小保留：保留审计壳与不可逆匿名化摘要，不保留敏感正文。

---

## 7. 列级加密字段建议

| 表 | 必须列级加密字段 | 说明 |
|---|---|---|
| member | phone_or_email | 联系方式 |
| baby_profile | name, dob, birth_weight_kg, birth_height_cm, birth_head_circ_cm | 儿童身份与健康基础信息 |
| growth_event | weight_kg, height_cm, head_circ_cm | 生长数据 |
| vaccine_event | vaccine_name, provider_name, batch_no | 疫苗敏感字段 |
| symptom_event | symptom_text | 原始症状描述 |
| media_asset | transcript_text, object_url(或采用签名 URL) | 媒体文本与路径 |
| consent | scope_json（视实现）、签名/附件字段 | 授权范围可能含敏感信息 |
| audit_log | metadata 中的敏感字段 | 审计中避免明文暴露 |
+
+### 7.1 密钥层次与落库要求
+
+| 对象 | 推荐密钥范围 | DB 中保存 | 不允许保存 |
+|---|---|---|---|
+| baby_profile / member | family 级 DEK | ciphertext + dek_ciphertext + key_version | 明文 DEK / KEK |
+| growth_event / symptom_event / vaccine_event | family 或 health-domain 级 DEK | ciphertext + dek_ciphertext + aad_context | 明文副本 |
+| media_asset transcript / object metadata | object-domain DEK | 密文 + key_version | 可直接访问的永久明文 URL |
+| backup/export | 独立 backup/export key domain | backup key ref | 复用主库同一个 DEK |
+
+**强制约束**：
+- KEK/CMK 仅存在 KMS/HSM；数据库内只允许存 DEK 密文。
+- 需要精确查找的高敏字段使用 blind index / tokenization，而不是明文字段索引。
+- Viewer 读取一律走脱敏投影，而不是直接查原表。

---

## 8. Viewer 脱敏投影策略

| 对象 | Viewer 可见 | Viewer 不可见 |
|---|---|---|
| conversation_session | summary_text、风险标签、时间 | 原始对话全文、详细症状推理 |
| symptom_event | symptom_code、severity、是否建议就医 | symptom_text、rule_evaluation 细节、媒体原件 |
| vaccine_event | 疫苗名摘要、剂次、是否已接种、到期时间 | batch_no、provider_name、完整备注 |
| media_asset | 缩略图/存在性标记 | 原始 URL、OCR/ASR 全文、人脸细节 |
| follow_up_task | 是否有待办、截止时间、摘要 | 医疗敏感备注、内部 workflow 细节 |
| growth_event | percentile/z-score 的摘要结论 | 精确原始值（如家庭设置需隐藏时） |

**原则**：Viewer 只看“足够协作”的摘要，不看“足以二次推断隐私”的原始数据。

---

## 9. Temporal / Workflow 落表映射

| 业务能力 | 落表 | 说明 |
|---|---|---|
| VaccineReminderWorkflow | scheduled_job + workflow_run + reminder | 调度、执行、提醒分离 |
| FollowUpWorkflow | workflow_run + follow_up_task + reminder | 支撑 24h/72h 随访 |
| DataRetentionWorkflow | scheduled_job + workflow_run + retention_deletion_policy | 自动归档/删除 |
| GrowthCheckWorkflow | scheduled_job + workflow_run + reminder | 月龄节点提醒 |
| 幂等保护 | idempotency_key | 防重复建提醒/重复写事件 |

**推荐做法**：workflow 落表必须独立于对话层，确保 E1 可测试 workflow correctness 与 DB state correctness。

---

## 10. deterministic rules 与 LLM/RAG 责任分界

| 领域 | deterministic rules 依赖表 | LLM/RAG 可读表 | 最终决定权 |
|---|---|---|---|
| 红旗症状分诊 | symptom_event、timeline_event.rule_ids_triggered、L1/L2 来源 | conversation_session 摘要、citation | Rule Engine |
| 生长评估 | growth_event、标准来源表/知识来源 | growth_event 摘要、citation | Rule Engine |
| 疫苗排程 | vaccine_event、scheduled_job、source_registry | reminder 文案、citation | Rule Engine |
| 喂养/睡眠趋势 | feeding_event、sleep_event | 时间线摘要、可解释文本 | Rules + 分析服务 |
| 权限/导出/删除 | member、consent、audit_log、retention_deletion_policy | 无 | RBAC / Policy Engine |
| 一般育儿问答 | source_registry、document_chunk、citation | document_chunk、embedding | safety_gate 否决 |

**核心原则**：
- LLM 负责自然语言解析、摘要、引用包装、低风险解释。
- deterministic rules 负责阈值判断、医学风险、权限审批、删除执行、免责声明插入。
- 任何 P0/P1 场景都不能让 LLM 单独闭环。

---

## 11. Trade-off 研判

### 11.1 单事件流 vs 多事件表
- 单事件流优点：统一 timeline、审计、回放、扩展容易。
- 单事件流缺点：字段稀疏、查询需配合子表。
- **推荐**：`timeline_event` + 高价值子表混合方案。

### 11.2 JSONB vs 强结构化
- JSONB 优点：灵活、适应多模态与长尾事件。
- JSONB 缺点：规则、评测、统计、索引较弱。
- **推荐**：金字段强结构化，其余 JSONB。

### 11.3 pgvector vs 外部向量库
- pgvector 优点：运维简单、事务邻近。
- 外部向量库优点：大规模检索更强。
- **推荐**：MVP 先 pgvector/近邻方案，规模增大再外扩。

### 11.4 软删 vs 硬删
- 软删利于恢复与审计。
- 硬删利于隐私合规。
- **推荐**：默认软删，正式删除走审批与匿名化/硬删混合策略。

---

## 12. 对 E1 / D2 / G1 的直接支撑

### 对 E1（Eval Harness）
- 可验证 tool-call 后 DB state correctness：如 vaccine_event、follow_up_task、reminder 是否正确写入。
- 可验证 workflow correctness：scheduled_job / workflow_run / idempotency_key 是否一致。
- 可做 replay/regression：timeline_event + conversation_session + citation 支撑完整回放。
- 可做 safety eval：symptom_event.rule_evaluation、audit_log.safety_block 可直接断言。

### 对 D2（多模态管线）
- media_asset + annotation + timeline_event 已具备挂载入口。
- 低置信识别结果可停留在 annotation.reviewer_status=pending，不直接污染主事件真相源。
- OCR/ASR 文本既可回挂 timeline，也可进 RAG，但受 pii_level 与权限约束。

### 对 G1（MVP Roadmap）
- MVP 可先上线 feeding/sleep/growth/vaccine/symptom/reminder/follow_up。
- workflow、审计、consent、retention 已具备渐进式实施边界。
- 数据结构支持先做单宝宝/单地区，再扩展多宝宝/多地区。

---

## 13. 仍需人工确认但不影响当前 PASS 的事项
1. 中国与国际疫苗 schedule code 的最终映射表仍需后续 C2/E1 联动细化。
2. 法务需最终确认不同地区 `license_status` 与 `region_scope` 的细颗粒度枚举。
3. 脱敏投影的产品默认值需与前端权限体验一起联调。
4. 极端高频媒体场景下，是否需要独立媒体元数据库，可在 D2 评估后决定。

---

## 14. 最终结论
本修订版已补齐：
- growth / sleep / vaccine / symptom 字段级设计；
- reminder / follow_up / workflow_run / scheduled_job / idempotency_key 工作流落表；
- 分区、冷热归档、级联删除、引用保留策略；
- source_registry / citation 的许可、地区、版本治理字段；
- 列级加密建议与 Viewer 脱敏投影策略。

**推荐结论**：该 schema 已达到 D1 的 PASS 标准，可作为 E1 与 D2 的直接前置输入，并部分解锁 G1 的路线图设计。