# Fawn Agent 确定性记录路由设计规格

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-05-04 |
| 状态 | review-ready |
| 依赖 | 当前 `backend/src/fawn/api/chat.py`, `backend/src/fawn/agent/graph.py`, `backend/src/fawn/services/tracker.py` |

---

## 1. 目标

将管家对“记录创建”和“记录查询”的处理从纯 ReAct 工具自选，升级为结构化意图识别后的后端确定性路由。

目标不是移除 LangGraph，而是给高价值、低歧义的 tracker 行为加一层可靠控制：

- 用户表达明确记录时，后端必须调用对应 service 写入。
- 用户表达明确查询时，后端必须查询对应数据并基于结果回复。
- 字段缺失或目标不唯一时，后端必须追问，不假装已执行。
- 权限仍由后端 service 强制，不依赖模型自觉。
- 开放聊天、知识问答、相册和画像更新继续走现有 LangGraph ReAct。

---

## 2. 当前问题

当前 Agent Graph 是标准 ReAct loop：

```text
agent -> tools -> agent -> END
```

是否调用工具主要由模型根据 prompt 和 tool schema 自行判断。这足够灵活，但无法稳定保证：

- “今天喝了 90ml 配方奶”一定写入 `feeding_records`。
- “查一下最近一周睡眠”一定调用 sleep 查询。
- 字段不完整时一定追问。
- 更新或删除时一定先确认目标记录。

对于 Fawn，tracker 数据是核心产品资产，不应长期依赖模型是否主动发起 `tool_calls`。

---

## 3. 范围

### 3.1 In Scope

第一版确定性路由覆盖以下行为：

| 行为 | 覆盖内容 |
|------|----------|
| 创建生长记录 | 体重、身高、头围、测量日期、备注 |
| 创建喂养记录 | 时间、类型、配方奶 ml、母乳时长、备注 |
| 创建睡眠记录 | 开始时间、结束时间、小睡/夜睡、夜醒次数、备注 |
| 创建健康记录 | 日期、类型、标题、描述 |
| 查询生长记录 | 最近 N 天、指定日期、趋势摘要 |
| 查询喂养记录 | 今天、指定日期、最近 N 天 |
| 查询睡眠记录 | 今天、指定日期、最近 N 天 |
| 查询健康时间线 | 最近记录、指定类型、指定时间范围 |
| 查询宝宝档案 | 宝宝基础资料 |
| 更新 tracker 记录 | 仅在目标记录唯一时执行，否则追问 |
| 删除 tracker 记录 | 仅在目标记录唯一时软删除，否则追问 |

### 3.2 Out Of Scope

以下工具暂时保留现有 ReAct 行为：

- `search_knowledge`
- `browse_photos`
- `update_user_profile`

原因：

- 知识库检索是否必要依赖问题类型和回答策略，第一版不强行路由。
- 相册浏览是辅助能力，误调或漏调影响小于 tracker 写入。
- 画像更新主观性强，自动写入容易误记用户偏好或敏感事实。

---

## 4. 核心设计

### 4.1 新增结构化意图识别层

在进入现有 LangGraph 前，先调用一个轻量 classifier，把用户消息转为结构化 JSON。

示例 schema：

```json
{
  "intent": "record_feeding",
  "confidence": 0.92,
  "slots": {
    "feed_time": "2026-05-04T09:00:00+08:00",
    "feed_type": "formula",
    "amount_ml": 90,
    "duration_min": null,
    "notes": null
  },
  "missing_slots": [],
  "needs_confirmation": false,
  "user_facing_question": null
}
```

Classifier 只做理解，不直接写数据、不生成最终答案。

### 4.2 后端路由决策

新增 orchestrator，根据 classifier 输出决定下一步：

```text
用户消息
  -> classify_tracker_intent
  -> deterministic route

record_* 且字段完整
  -> call tracker service
  -> return confirmation response

query_* 且条件明确
  -> call query service
  -> summarize result

update/delete 且目标唯一
  -> call update/delete service
  -> return confirmation response

字段缺失或目标不唯一
  -> return clarification question

非 tracker 意图或低置信度
  -> fallback to existing LangGraph graph
```

### 4.3 置信度策略

第一版采用保守阈值：

- `confidence >= 0.75` 且 `intent` 属于 tracker 范围：进入确定性路由。
- `confidence < 0.75`：交给现有 LangGraph。
- `missing_slots` 非空：不调用 service，直接追问。
- `needs_confirmation = true`：不调用 service，直接追问。

这样可以避免 classifier 半懂不懂时误写数据。

---

## 5. 意图与字段规则

### 5.1 创建记录

| Intent | 必填字段 | 可选字段 |
|--------|----------|----------|
| `record_growth` | `measurement_date`，至少一个 `weight_g/height_cm/head_cm` | `notes` |
| `record_feeding` | `feed_time`, `feed_type` | `amount_ml`, `duration_min`, `notes` |
| `record_sleep` | `sleep_start`, `sleep_type` | `sleep_end`, `night_wakings`, `notes` |
| `record_health` | `record_date`, `record_type`, `title` | `description` |

喂养规则：

- `formula` 应优先要求 `amount_ml`。
- `breast` 应优先要求 `duration_min`。
- `solid` 暂时不主动用于 0-6 个月测试数据；如果用户明确说辅食，允许按现有模型记录，但回复应提醒通常 6 个月左右开始添加。

睡眠规则：

- `nap` 的 `night_wakings` 固定为 0。
- `night` 可以记录 `night_wakings`。
- 没有结束时间时允许记录进行中或不完整睡眠，但回复必须说明“结束时间为空”。

### 5.2 查询记录

| Intent | 常见触发 | 默认范围 |
|--------|----------|----------|
| `query_growth` | “最近长得怎么样”“查生长记录” | 最近 90 天 |
| `query_feeding` | “今天吃了多少”“最近一周喂养” | 今天或用户给定范围 |
| `query_sleep` | “今天睡了多久”“最近睡眠怎么样” | 今天或用户给定范围 |
| `query_health` | “最近健康记录”“打过什么疫苗” | 最近 20 条 |
| `query_baby_profile` | “宝宝多大了”“宝宝档案” | 当前默认宝宝 |

查询结果由后端拿到结构化数据后，可以使用 LLM 生成自然语言总结；但查询动作本身必须由后端决定。

### 5.3 更新与删除

更新/删除必须比创建更保守。

允许直接执行的情况：

- 用户提供明确 `record_id`。
- 或当前 conversation 中最近一次由 Agent 创建的记录唯一匹配。
- 或条件过滤后只有一条候选记录。

必须追问的情况：

- “删掉昨天那条记录”但昨天有多条。
- “改一下奶量”但没有明确哪条喂养记录。
- 条件能匹配不同 record type。

追问应展示简短候选，例如时间、类型、关键数值，不展示内部 JSON。

---

## 6. 与现有 LangGraph 的关系

现有 `agent/graph.py` 保留为 fallback。

```text
deterministic tracker route handled
  -> 不进入 graph

deterministic tracker route not handled
  -> 进入现有 graph
```

这样可以避免一次性重写所有管家能力。

未来如果知识库或相册也需要强保证，可以再把它们接入同一个 classifier/orchestrator，但第一版不做。

---

## 7. 数据与权限

确定性路由不绕过现有 service。

所有写入继续走：

- `tracker_service.create_growth_record`
- `tracker_service.create_feeding_record`
- `tracker_service.create_sleep_record`
- `tracker_service.create_health_record`
- `tracker_service.update_tracker_record`
- `tracker_service.delete_tracker_record`

因此权限、家庭隔离、软删除、WHO 百分位计算继续复用已有逻辑。

`friend` 用户触发写入时，service 会拒绝。orchestrator 应捕获 `PermissionDenied` 并返回友好说明：当前账号只有查看权限，不能记录、修改或删除数据。

---

## 8. 响应策略

### 8.1 创建成功

创建成功回复应简短确认：

```text
已记录 09:00 配方奶 90ml。
```

如果生长记录计算出 WHO 百分位，可以附带一句：

```text
已同步计算 WHO 参考百分位。
```

### 8.2 查询成功

查询成功可以由 LLM 基于结构化结果生成简短总结，但不能编造缺失数据。

如果没有数据：

```text
这段时间还没有睡眠记录。
```

### 8.3 字段缺失

字段缺失时只问最关键的缺失项：

```text
这条喂养记录是配方奶还是母乳？
```

不要一次问太多字段。

### 8.4 路由失败

classifier 出错、JSON 解析失败、低置信度时，不阻断聊天，fallback 到现有 LangGraph。

---

## 9. 流式协议

确定性路由可以继续使用现有 SSE endpoint，但事件更简单：

```text
data: {"type":"token","content":"已记录 09:00 配方奶 90ml。"}
data: {"type":"done","message_id":"...","message_type":"text"}
```

如果希望前端展示工具执行过程，可以额外发：

```text
data: {"type":"tool_call","name":"record_feeding","args":{...}}
data: {"type":"tool_result","name":"record_feeding","result":{...}}
```

第一版可以保留这些事件，便于 debug，但 UI 不需要突出显示。

---

## 10. 测试计划

### 10.1 单元测试

新增 classifier/orchestrator 测试：

- 明确配方奶记录会生成 `record_feeding`。
- 明确母乳记录会生成 `record_feeding` 且使用 `duration_min`。
- 明确小睡记录会生成 `record_sleep` 且 `night_wakings = 0`。
- 明确生长记录会生成 `record_growth`。
- 明确健康记录会生成 `record_health`。
- 缺少关键字段时返回追问，不调用 service。
- 低置信度时 fallback。

### 10.2 API 测试

通过 `/api/chat/conversations/{id}/messages` 验证：

- 父母/家人通过自然语言创建记录后，数据库有对应记录。
- 朋友请求创建记录时，数据库不写入，返回权限说明。
- 查询今天喂养时返回真实统计。
- 查询无数据时明确返回“没有数据”。
- 更新/删除目标不唯一时不执行并追问。

### 10.3 回归测试

保留现有 chat streaming 行为：

- 普通聊天仍能走现有 LangGraph。
- 健康咨询仍触发安全提示风格。
- 图片消息路径不被 tracker route 误处理。

---

## 11. 实施顺序

1. 新增 intent schema 和 classifier。
2. 新增 tracker orchestrator，先实现创建与查询。
3. 将 chat endpoint 接入 orchestrator，未处理时 fallback 到 graph。
4. 补充更新/删除的目标匹配和确认逻辑。
5. 增加测试，覆盖权限、字段缺失、无数据、fallback。
6. 手动用 Docker 本地跑前后端验证真实聊天记录写入。

---

## 12. 风险与约束

- Classifier 仍然使用 LLM，因此结构化提取本身不是绝对可靠；后端必须用 schema、置信度和字段校验兜底。
- 更新/删除不能激进执行，否则容易误删用户数据。
- 确定性路由会增加 chat endpoint 复杂度，应尽量把逻辑放进独立 orchestrator，避免继续膨胀 `chat.py`。
- 第一版不改变数据库 schema，不做迁移。
- 第一版不改变前端协议，继续兼容现有 SSE。

