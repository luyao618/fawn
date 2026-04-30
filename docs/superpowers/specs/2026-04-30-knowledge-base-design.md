# Fawn RAG 知识库构建方案

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-04-30 |
| 状态 | approved |
| 依赖 | PRD-V2.md, BACKEND-DESIGN-V2.md |

---

## 1. 目标

用现有 `docs/books/` 中的育儿参考资料，为 Fawn Agent 构建 RAG 知识库。覆盖喂养、睡眠、生长发育、常见症状、日常护理五大类场景。

**原则：**
- 先用现有资料跑通完整 pipeline，验证质量后再增量补充
- 结构化数据走确定性逻辑，不入 RAG
- 部署即可用，无需运行时调用 Embedding API

---

## 2. 资料分类

### 2.1 入 RAG 的长文本资料

| 资料 | 文件 | 大小 | 语言 | doc_type |
|------|------|------|------|----------|
| 海蒂育儿大百科 0-1 岁 | `parenting-books/海蒂育儿大百科_0-1岁_完整版.md` | ~2.0MB | 中文 | `book_zh` |
| AAP 育儿百科（第六版） | `parenting-books/美国儿科学会育儿百科（第六版） - 斯蒂文·谢尔弗.txt` | ~1.8MB | 中文 | `book_zh` |
| IYCF 喂养模型章节 | `WHO-feeding-guidelines/IYCF_model_chapter_2009.md` | ~340KB | 英文 | `guide_en` |
| WHO 新生儿健康建议 | `WHO-feeding-guidelines/WHO-newborn-health-recommendations-2017.md` | ~52KB | 英文 | `guide_en` |

### 2.2 入 RAG 的短文档（整篇入库）

| 资料 | 文件 | 大小 | doc_type |
|------|------|------|----------|
| CDC 发育里程碑（2/4/6 月） | `CDC-developmental-milestones/milestones-*.md` | ~3KB | `checklist` |
| 中国免疫接种计划 | `CN-immunization-schedule/schedule.md` | ~3.5KB | `checklist` |

### 2.3 不入 RAG 的资料

| 资料 | 原因 | 用途 |
|------|------|------|
| WHO 生长标准 Excel（体重/身长/头围） | 结构化数值数据 | Tracker 模块百分位计算，代码内查表 |
| 免疫接种 PDF 原件 | 已有 markdown 版 | 不重复入库 |
| README.md 索引文件 | 非知识内容 | 不入库 |

---

## 3. 切片策略

### 3.1 `book_zh` — 中文育儿书

- **解析方式**：按 Markdown heading（`#`/`##`/`###`）拆分章节，章节内用 `RecursiveCharacterTextSplitter` 切片
- **chunk_size**：500 字符
- **chunk_overlap**：80 字符
- **元数据**：`chapter_title`（最近一级 heading），`document_title`，`doc_type`
- **特殊处理**：`.txt` 文件（AAP 育儿百科）无 markdown heading，用正则检测章节模式（"第X章"、"第X部分"或连续大写行）

### 3.2 `guide_en` — 英文 WHO 指南

- **解析方式**：按 Markdown heading 拆分，章节内切片
- **chunk_size**：800 字符（英文单词平均 5-6 字符，800 字符 ≈ 中文 500 字的信息量）
- **chunk_overlap**：120 字符
- **元数据**：`chapter_title`，`document_title`，`doc_type`

### 3.3 `checklist` — 短结构化文档

- **解析方式**：整篇作为 1 个 chunk 入库（单个文件 < 4KB）
- **不切片**，保留完整结构
- **元数据**：`document_title`，`doc_type`；CDC 里程碑额外加 `age_months` 标记月龄

### 3.4 切片质量兜底

- 单个 chunk < 50 字符：合并到相邻 chunk
- 单个章节 > 3000 字符：强制切片

---

## 4. 入库 Pipeline

### 4.1 配置文件

`backend/knowledge_manifest.yaml` 描述所有待入库资料：

```yaml
documents:
  - title: "海蒂育儿大百科 0-1岁"
    author: "Heidi Murkoff"
    source: "WHO-approved-books"
    doc_type: book_zh
    path: "docs/books/parenting-books/海蒂育儿大百科_0-1岁_完整版.md"

  - title: "美国儿科学会育儿百科（第六版）"
    author: "斯蒂文·谢尔弗"
    source: "AAP"
    doc_type: book_zh
    path: "docs/books/parenting-books/美国儿科学会育儿百科（第六版） - 斯蒂文·谢尔弗.txt"

  - title: "IYCF Model Chapter"
    author: "WHO"
    source: "WHO"
    doc_type: guide_en
    path: "docs/books/WHO-feeding-guidelines/IYCF_model_chapter_2009.md"

  - title: "WHO Newborn Health Recommendations"
    author: "WHO"
    source: "WHO"
    doc_type: guide_en
    path: "docs/books/WHO-feeding-guidelines/WHO-newborn-health-recommendations-2017.md"

  - title: "CDC Developmental Milestones - 2 Months"
    author: "CDC"
    source: "CDC"
    doc_type: checklist
    path: "docs/books/CDC-developmental-milestones/milestones-2-months.md"
    metadata:
      age_months: 2

  - title: "CDC Developmental Milestones - 4 Months"
    author: "CDC"
    source: "CDC"
    doc_type: checklist
    path: "docs/books/CDC-developmental-milestones/milestones-4-months.md"
    metadata:
      age_months: 4

  - title: "CDC Developmental Milestones - 6 Months"
    author: "CDC"
    source: "CDC"
    doc_type: checklist
    path: "docs/books/CDC-developmental-milestones/milestones-6-months.md"
    metadata:
      age_months: 6

  - title: "中国国家免疫规划疫苗接种程序（2021年版）"
    author: "国家卫生健康委员会"
    source: "NHC"
    doc_type: checklist
    path: "docs/books/CN-immunization-schedule/schedule.md"
```

### 4.2 入库流程

```
1. 读取 knowledge_manifest.yaml
2. 遍历每份资料：
   a. 检查是否已入库（按 title + source 去重）
   b. 根据 doc_type 选择切片策略
   c. 解析章节结构 → 切片 → 生成元数据
   d. 调用 SiliconFlow bge-m3 生成 embeddings
   e. 写入 knowledge_documents + knowledge_chunks 表
   f. 输出入库统计（文档名、chunk 数量、总字符数）
3. 全部完成后输出汇总报告
```

### 4.3 增量入库

- 已入库文档自动跳过（按 `title + source` 去重）
- 需要重新入库时，`--force` 参数先删除该文档所有 chunks 再重新导入
- 新增资料只需在 manifest 中添加记录，重跑脚本

### 4.4 脚本入口

```bash
# 入库全部资料
python -m fawn.scripts.ingest_knowledge

# 入库指定资料
python -m fawn.scripts.ingest_knowledge --doc "海蒂育儿大百科 0-1岁"

# 强制重新入库
python -m fawn.scripts.ingest_knowledge --doc "海蒂育儿大百科 0-1岁" --force
```

### 4.5 Embedding 模型

- 模型：`bge-m3`（BAAI/bge-m3），通过 SiliconFlow API 调用
- 维度：固定 1024 维（bge-m3 支持 512/768/1024，选 1024 以保留最大语义精度）
- 现有代码使用 `OpenAIEmbeddings`，SiliconFlow 兼容 OpenAI API 格式，只需修改 `base_url` 和 `model` 配置
- 注意：从 `text-embedding-3-small`（1536 维）切换到 `bge-m3`（1024 维），需要调整 `knowledge_chunks` 表的 `vector(1536)` 为 `vector(1024)`，通过 Alembic 迁移实现

---

## 5. 验证方案

### 5.1 测试问题集

`backend/knowledge_eval.yaml`，覆盖 5 大类场景，每类 5-6 个问题，共约 30 个：

```yaml
questions:
  - query: "宝宝3个月，每天应该吃多少奶？"
    category: feeding
    expected_source: "海蒂育儿大百科 0-1岁"
    expected_keywords: ["奶量", "毫升", "次"]

  - query: "新生儿黄疸多久能消退？"
    category: symptom
    expected_source: "美国儿科学会育儿百科（第六版）"
    expected_keywords: ["黄疸", "胆红素"]

  - query: "4个月宝宝应该会什么？"
    category: development
    expected_source: "CDC Developmental Milestones - 4 Months"
    expected_keywords: ["抬头", "社交"]

  - query: "exclusive breastfeeding WHO recommendation"
    category: feeding
    expected_source: "IYCF Model Chapter"
    expected_keywords: ["exclusive", "6 months"]

  - query: "宝宝2个月需要打什么疫苗？"
    category: health
    expected_source: "中国国家免疫规划疫苗接种程序（2021年版）"
    expected_keywords: ["脊灰", "疫苗"]

  # ... 共约 30 个问题
```

### 5.2 第一层：人工 Spot Check

运行 eval 脚本后，输出每个问题的 top-5 检索结果，人工逐条检查：
- 最相关的结果是否排在前 3？
- 来源标注是否正确？
- 有没有明显不相关的结果混入？

### 5.3 第二层：自动化指标报告

| 指标 | 说明 | 达标线 |
|------|------|--------|
| Source Hit@3 | top-3 结果中包含期望文档的问题占比 | ≥ 80% |
| Keyword Recall | 期望关键词在 top-3 结果中的命中率 | ≥ 70% |
| Avg Similarity | top-1 结果的平均 cosine similarity | ≥ 0.75 |
| Low Confidence Rate | similarity < 0.7 的问题占比 | ≤ 20% |

### 5.4 报告输出

```bash
python -m fawn.scripts.eval_knowledge
```

```
Knowledge Base Evaluation Report
================================
Total questions: 30
Source Hit@3:       27/30 (90.0%) ✅
Keyword Recall:    24/30 (80.0%) ✅
Avg Top-1 Sim:     0.82          ✅
Low Confidence:    3/30 (10.0%)  ✅

Failed cases:
  - "宝宝湿疹反复怎么办" → top-1 sim=0.61, source mismatch
  ...
```

### 5.5 验证节奏

1. 入库完成后跑一次 eval，看整体指标
2. 针对 failed cases 分析原因（切片问题？资料缺失？query 改写？）
3. 调整后重跑，直到全部达标

---

## 6. 部署方案

### 6.1 构建阶段（开发环境）

```bash
# 1. 本地启动 PostgreSQL + pgvector
docker compose up db -d

# 2. 运行 Alembic 迁移
alembic upgrade head

# 3. 运行入库脚本
python -m fawn.scripts.ingest_knowledge

# 4. 运行验证，确认达标
python -m fawn.scripts.eval_knowledge

# 5. 导出知识库为 SQL dump
pg_dump --data-only --table=knowledge_documents --table=knowledge_chunks \
  -f backend/seeds/knowledge_seed.sql fawn
```

### 6.2 部署阶段（Docker Compose）

与现有初始化方式一致，知识库 seed 加入 backend 容器的启动命令链中：

```yaml
# docker-compose.yml (backend service command)
command: >
  sh -c "alembic upgrade head &&
         python -m scripts.seed_users --idempotent &&
         python -m scripts.seed_who_data --idempotent &&
         python -m scripts.seed_knowledge --idempotent &&
         uvicorn fawn.main:app --host 0.0.0.0 --port 8000"
```

`scripts/seed_knowledge.py` 逻辑：检查 `knowledge_documents` 表是否已有数据，若为空则加载 `backend/seeds/knowledge_seed.sql`。

PostgreSQL 镜像保持 `pgvector/pgvector:pg16`，与 BACKEND-DESIGN-V2.md 一致。

`docker compose up` 后，backend 容器依次完成迁移、用户/WHO/知识库初始化，然后启动 API 服务。

### 6.3 知识库更新流程

```
1. 本地修改 manifest / 新增资料
2. 重新入库 + 验证
3. 重新导出 knowledge_seed.sql
4. 提交 Git
5. 目标机器：docker compose down -v && docker compose up
```

`-v` 清除旧数据卷以触发重新初始化。

### 6.4 注意事项

- `knowledge_seed.sql` 预计大小 30-50MB（原始文本 + 1024 维 embeddings），Git 可接受
- 如果未来超过 100MB，改用 Git LFS 或外部下载
- `seed_knowledge.py` 幂等设计：已有数据时跳过，与 `seed_users.py`、`seed_who_data.py` 风格一致

---

## 7. 与现有代码的差异和改动点

| 现有代码 | 需要调整 |
|---------|---------|
| `ingest.py` chunk_size=1000, overlap=200 | 按 doc_type 分策略：book_zh 500/80, guide_en 800/120, checklist 不切 |
| `ingest.py` 无章节解析 | 新增 heading 解析器，提取 chapter_title 元数据 |
| `__init__.py` 使用 `OpenAIEmbeddings` | 配置 base_url 指向 SiliconFlow，model 改为 bge-m3 |
| `knowledge_chunks` 表 `vector(1536)` | Alembic 迁移改为 `vector(1024)` |
| 无 manifest 配置 | 新增 `backend/knowledge_manifest.yaml` |
| 无验证脚本 | 新增 `fawn.scripts.eval_knowledge` + `backend/knowledge_eval.yaml` |
| 无 seed 机制 | 新增 `backend/seeds/` 目录及 Docker 初始化脚本 |
