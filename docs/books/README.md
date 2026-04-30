# Fawn Knowledge Base — 资料索引

本目录存放 Fawn 项目 RAG 知识库的原始资料。所有入库资料须满足 PRD §7.7 的准入标准：

| ✅ 允许入库 | ❌ 不允许入库 |
|------------|-------------|
| WHO/CDC/卫健委等官方指南 | 个人博客、论坛帖子 |
| 权威育儿书籍（专业作者出版物） | UGC 内容 |
| 医学期刊公开摘要 | 商业推广内容 |

每份资料需记录：来源名称、作者/机构、出版/发布日期。

---

## 已收录

### 1. WHO Child Growth Standards（结构化数据）
- **目录：** `WHO-growth-standards/`
- **来源：** World Health Organization
- **日期：** 2006-2009（标准发布），2026-04-30（下载）
- **内容：** 体重/身长/头围的 z-score、百分位、LMS 参数表（Excel），覆盖出生至 5 岁
- **用途：** Tracker 模块 WHO 百分位确定性计算

---

### 2. CDC Developmental Milestones（结构化数据）
- **目录：** `CDC-developmental-milestones/`
- **来源：** U.S. Centers for Disease Control and Prevention (CDC), Learn the Signs. Act Early.
- **日期：** 2022 修订版，2026-04-30（抓取）
- **内容：** 2/4/6 月龄发育里程碑 checklist（社交情感、语言沟通、认知、运动），Markdown 格式
- **用途：** Advisor 模块回答发育里程碑相关问题

### 3. 中国国家免疫规划疫苗接种程序（结构化数据）
- **目录：** `CN-immunization-schedule/`
- **来源：** 国家卫生健康委员会，2021 年版
- **日期：** 2021（发布），2026-04-30（整理）
- **内容：** 0-6 岁完整疫苗接种时间表（中英文）+ 0-6 月重点摘要，Markdown 格式
- **用途：** Tracker 健康模块疫苗日程提醒
- **注意：** 官方 PDF 原链接已失效（nhc.gov.cn 改版），内容基于 2021 版标准整理

---

### 4. WHO Feeding Guidelines（官方指南）
- **目录：** `WHO-feeding-guidelines/`
- **来源：** World Health Organization
- **日期：** 2009/2017（发布），2026-04-30（收录）
- **内容：**
  - `IYCF_model_chapter_2009.md` — 婴幼儿喂养模型章节（112 页，339KB）
  - `WHO-newborn-health-recommendations-2017.md` — 新生儿健康建议（26 页，51KB）
- **用途：** Advisor 模块喂养相关问题回答

---

## 待收录

### 官方指南（免费 PDF）
| 资料 | 机构 | 状态 |
|------|------|------|
| 中国居民膳食指南（2022）婴幼儿部分 | 中国营养学会 | ⬜ 待下载 |
| 0-6 岁儿童健康管理技术规范 | 国家卫健委 | ⬜ 待下载 |

### 权威书籍
| 书名 | 作者 | 状态 |
|------|------|------|
| 海蒂育儿大百科 0-1 岁 (What to Expect the First Year) | Heidi Murkoff | ✅ 已入库（MD，1.9M） |
| 美国儿科学会育儿百科 第六版 | 斯蒂文·谢尔弗 | ✅ 已入库（TXT，1.7M） |
| 崔玉涛推荐 42 天月子手册 | 崔玉涛 | ⬜ 待购买 |
| 西尔斯亲密育儿百科 (The Baby Book) | William Sears | ⬜ 待购买 |
| 婴幼儿睡眠全书 | 小土大橙子 | ⬜ 待购买 |

### 医学期刊/学术资源
| 来源 | 说明 | 状态 |
|------|------|------|
| PubMed Central (PMC) | 新生儿高频问题专题论文（黄疸、湿疹、肠绞痛等） | ⬜ 待检索下载 |
