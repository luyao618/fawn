# Fawn Research Deliverables

这目录收纳了 Fawn 项目的研究交付物与 review 记录，来源于早期 `baby-agent-research` 调研工作区，现已按更适合 Fawn 的命名规范整理。

## 命名规范

统一采用：`fawn-<topic>.<ext>`

优点：
- 和 Fawn 项目语义一致
- 文件名可读性更高
- 便于后续继续扩展实现文档、设计文档与评审文档
- review 文件与主文档保持一一对应

## 目录结构

- `fawn-framework-landscape.md` — agent / workflow / framework 方案对比与推荐组合
- `fawn-system-architecture.md` — 系统总体架构建议
- `fawn-knowledge-base-design.md` — 分层知识库设计
- `fawn-source-matrix.csv` — 权威来源矩阵
- `fawn-growth-rules.md` — 生长标准与 deterministic rules
- `fawn-vaccine-triage-rules.md` — 疫苗与分诊规则
- `fawn-database-schema.md` — 数据库 schema 草案
- `fawn-multimodal-pipeline.md` — 多模态摄入与检索管线
- `fawn-eval-harness.md` — eval / harness 设计
- `fawn-safety-privacy-compliance.md` — 安全、隐私、合规边界
- `fawn-mvp-roadmap.md` — MVP 路线图
- `fawn-open-questions-decisions.md` — 开放问题与待决策清单
- `reviews/` — 对应每份交付物的 review 记录

## 推荐阅读顺序

### 先看全局框架
1. `fawn-framework-landscape.md`
2. `fawn-system-architecture.md`
3. `fawn-mvp-roadmap.md`

### 再看核心设计
4. `fawn-knowledge-base-design.md`
5. `fawn-database-schema.md`
6. `fawn-multimodal-pipeline.md`
7. `fawn-eval-harness.md`
8. `fawn-safety-privacy-compliance.md`

### 最后看规则与执行细节
9. `fawn-source-matrix.csv`
10. `fawn-growth-rules.md`
11. `fawn-vaccine-triage-rules.md`
12. `fawn-open-questions-decisions.md`

## 原文件名映射

- `01-agent-framework-landscape.md` → `fawn-framework-landscape.md`
- `02-system-architecture-recommendation.md` → `fawn-system-architecture.md`
- `03-knowledge-base-design.md` → `fawn-knowledge-base-design.md`
- `04-source-matrix.csv` → `fawn-source-matrix.csv`
- `05-growth-standards-and-rules.md` → `fawn-growth-rules.md`
- `06-vaccine-and-triage-rules.md` → `fawn-vaccine-triage-rules.md`
- `07-database-schema-draft.md` → `fawn-database-schema.md`
- `08-multimodal-pipeline.md` → `fawn-multimodal-pipeline.md`
- `09-eval-harness-design.md` → `fawn-eval-harness.md`
- `10-safety-privacy-compliance.md` → `fawn-safety-privacy-compliance.md`
- `11-mvp-roadmap.md` → `fawn-mvp-roadmap.md`
- `12-open-questions-and-decisions.md` → `fawn-open-questions-decisions.md`

## 当前状态

- 12 份 research deliverables 已完成 Fawn 命名重整
- 对应 12 份 review 文件已放入 `reviews/`
- 当前目录可直接作为 Fawn 项目的研究文档入口

## 下一步建议

如果要进入实施阶段，建议基于这些文档继续产出：
- Fawn 技术选型定稿文档
- repo 目录结构设计
- 第一版数据库 DDL / migration
- workflow 状态机与事件模型
- MVP 实施计划
