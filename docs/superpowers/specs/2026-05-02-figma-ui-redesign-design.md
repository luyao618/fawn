# Fawn Figma UI 改版设计规格

| 字段 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-05-02 |
| 状态 | review-ready |
| 依赖 | `docs/FRONTEND-DESIGN-V2.md`, `docs/PRD-V2.md`, Figma 文件 `K02dLT9hfPg89Pf1W0daZg` |

---

## 1. 目标

用 Figma 文件 `fawn` 作为视觉参考，重做 Fawn 前端的移动端 UI 气质和轻量页面布局，同时保留当前产品行为、数据流、权限和后端模型边界。

本次改版采用 **视觉为主，轻微重排** 的策略：

- 保留现有登录鉴权、API 数据流、chat streaming、相册上传、profile 管理逻辑
- 保留中文家庭使用场景，Figma 英文示例只作为布局参考
- 将底部导航从 4 个 Tab 扩展为 5 个 Tab
- 新增真实可用的 `/record` 快捷记录页
- 不做全量信息架构重写，不新增尿布或趴玩数据模型

---

## 2. Figma 映射

| 当前/目标路由 | Figma frame | Node ID | 用途 |
|---------------|-------------|---------|------|
| `/chat` | AI 育儿管家 (优化布局) | `1:658` | 主聊天界面参考 |
| `/dashboard` | 宝宝成长记录板 | `1:126` | 成长趋势与摘要参考 |
| `/record` | 快捷记录中心 | `1:387` | 新增快捷记录页参考 |
| `/album` | 智慧相册 | `1:278` | 相册页面参考 |
| `/profile` | 家庭与隐私设置 | `1:522` | 家庭与设置页面参考 |

旧 frame `AI 育儿管家 (聊天)` 不作为主实现参考；`/chat` 以 `AI 育儿管家 (优化布局)` 为准。

---

## 3. 范围

### 3.1 In Scope

- 全局视觉系统刷新：颜色、背景、圆角、阴影、卡片、按钮、输入区、导航
- 共享 shell 刷新：`TopBar`, `TabBar`, mobile shell safe-area 行为
- 五个主页面 UI 改版：`/chat`, `/dashboard`, `/record`, `/album`, `/profile`
- 新增 `/record` 路由，支持真实创建 4 类 tracker 记录
- 补充后端 tracker create API 和前端 API client 方法
- 更新测试以覆盖导航、记录提交和关键行为回归

### 3.2 Out of Scope

- 尿布、趴玩数据模型和入口
- 全英文文案迁移
- 大幅后端重构
- 替换现有 auth、chat、album、profile、permission 逻辑
- 像素级复刻 Figma

---

## 4. 导航

底部导航从当前 4 个 Tab 改为 5 个：

| Label | Route | 说明 |
|-------|-------|------|
| 管家 | `/chat` | 主对话入口 |
| 成长 | `/dashboard` | 成长趋势与状态 |
| 记录 | `/record` | 新增快捷记录入口 |
| 相册 | `/album` | 智慧相册 |
| 家庭 | `/profile` | 家庭与设置 |

`记录` 使用独立中间 Tab，不作为 dashboard 的局部入口。底部导航应延续 Figma 的 rounded glass 风格，并保留 safe-area 处理。

---

## 5. 视觉系统

### 5.1 方向

现有 UI 偏朴素暖色，本次改版转向 Figma 的柔和、轻盈、育儿管家气质：

- 主背景：浅蓝白/柔白，如 `#F8F9FF`, `#FFFFFF`
- 情绪底色：warm yellow、mint、soft blue
- 卡片：白底、柔和阴影、较大圆角
- 顶部栏/底部栏：半透明、轻 blur、柔和阴影
- 功能卡：用颜色区分记录类型，但避免单一色相统治

### 5.2 实现原则

- 优先更新 `globals.css` CSS variables 与 `tailwind.config.ts` token
- 优先升级现有共享组件，不另起一套并行设计系统
- 页面局部允许少量 Figma-specific layout，但颜色、圆角、阴影应复用 token
- 不使用 viewport-width 字体缩放
- 中文文本必须在 360px 左右窄屏下不溢出、不遮挡

### 5.3 共享组件

需要升级：

- `Card`
- `Button`
- `Avatar`
- `TopBar`
- `TabBar`
- Chat input
- Chat message bubble
- Segmented controls
- Dashboard stat cards
- Album photo cards

新增组件仅限明确复用场景，例如：

- `QuickRecordCard`
- `QuickRecordForm`
- `RecordSuccessToast` 或同等成功反馈组件

---

## 6. 页面设计

### 6.1 管家 `/chat`

参考 Figma frame `AI 育儿管家 (优化布局)`。

保留：

- conversation loading
- streaming response
- image upload
- safety alert
- quick action chips
- history entry
- current auth behavior

调整：

- 顶部栏改为 Figma 的柔和半透明 shell
- 背景加入低调 nursery atmosphere 的层次感，但不使用会干扰阅读的装饰
- 消息组采用更稳定的左右宽度、头像、时间和气泡层级
- assistant 回复可继续承载 data card/safety card
- 输入区改为圆润 persistent control，保留上传和发送按钮

### 6.2 成长 `/dashboard`

参考 Figma frame `宝宝成长记录板`。

定位从“数据 + 完整记录管理”调整为“趋势 + 摘要”。

保留：

- baby summary
- growth chart
- feeding stats
- sleep stats
- health timeline/recent health context

调整：

- 增加 AI 摘要风格的顶部卡片
- 喂养/睡眠 stats 用 Figma quick stats 卡片处理
- growth chart 使用更柔和的白卡片容器
- 删除/移出完整 JSON 编辑式 `TrackerRecordList`
- 保留最近记录摘要，并提供到 `/record` 的明确入口

### 6.3 记录 `/record`

参考 Figma frame `快捷记录中心`。

新增独立页面，支持真实创建：

- 喂养
- 睡眠
- 生长
- 健康

不显示：

- 尿布
- 趴玩

页面结构：

- 顶部欢迎/提示区
- 4 个 Bento 快捷入口
- 点击入口后显示紧凑表单
- 提交成功后给出清晰成功反馈并重置表单或展示最近提交摘要

表单字段：

| 类型 | 字段 |
|------|------|
| 喂养 | feed time, feed type, amount ml, duration min, notes |
| 睡眠 | sleep start, sleep end, sleep type, night wakings, notes |
| 生长 | measurement date, weight g, height cm, head cm |
| 健康 | record date, record type, title, description |

权限：

- 使用现有 `canWriteTracker` 前端判断
- 后端使用 `require_tracker_writer`
- 只读用户能看到页面说明和最近记录提示，但不能提交

### 6.4 相册 `/album`

参考 Figma frame `智慧相册`。

保留：

- timeline/scene/milestone 三种 view mode
- upload
- photo viewer
- tag confirmation
- permission behavior

调整：

- 增加 AI insight banner
- 分类/视图切换改成更轻的 Figma 风格 segmented controls
- photo grid 卡片更柔和，减少硬边框
- 上传入口更符合底部移动端操作习惯

### 6.5 家庭 `/profile`

参考 Figma frame `家庭与隐私设置`。

保留：

- 当前用户资料
- baby profile
- admin family member management
- permissions update
- profile memory list edit/delete

调整：

- 顶部身份卡增强家庭感
- 家庭成员管理区视觉升级
- 数据与隐私内容分组成卡片
- profile memory list 改为更清晰的设置/资料项列表

---

## 7. 数据/API 设计

当前后端 service 已有 create tracker 函数，但 API 层只公开 list/update/delete。本次补充 create endpoints。

### 7.1 后端新增 endpoints

- `POST /tracker/growth`
- `POST /tracker/feeding`
- `POST /tracker/sleep`
- `POST /tracker/health`

要求：

- 均使用 `require_tracker_writer`
- 均复用 `tracker_service.create_*_record`
- 成功返回对应 read schema
- validation error 返回 422
- permission denied 返回 403

建议新增 request schemas：

- `GrowthRecordCreate`
- `FeedingRecordCreate`
- `SleepRecordCreate`
- `HealthRecordCreate`

### 7.2 前端 API client

新增 typed client methods：

- `createGrowthRecord`
- `createFeedingRecord`
- `createSleepRecord`
- `createHealthRecord`

mock mode 需要同步支持：

- 在 mock arrays 中插入新记录
- 返回 clone 后的 created record
- dashboard 刷新后能从 mock 数据反映新增记录

跨页面实时同步不强制要求。提交后当前页显示成功即可，dashboard 通过刷新或重新进入读取新数据。

---

## 8. 状态设计

每个主页面至少覆盖：

- loading
- empty
- error
- permission-limited/read-only

重点：

- `/record` 无写权限时不能展示可提交表单
- `/chat` streaming 时输入 disabled 状态不能退化
- `/album` 上传中和无权限上传状态要保持清晰
- `/dashboard` 无数据时仍应有合理摘要壳层

---

## 9. 测试策略

### 9.1 Backend

新增 API 测试：

- 4 类 POST 成功创建记录
- 无 tracker write 权限返回 403
- invalid payload 返回 422
- created growth record 继续计算 percentile（在可用参考数据场景）

### 9.2 Frontend

更新/新增测试：

- 5 Tab 导航存在并跳转到正确路由
- `/record` 四类表单可提交
- 无权限用户不能新增 tracker record
- `/dashboard` 不再展示完整 JSON 编辑管理，展示最近记录摘要
- `/chat` 输入、streaming、image upload 关键行为不被改坏
- `/album` view mode、upload、viewer 行为保留
- `/profile` 权限管理和 profile item 操作保留

### 9.3 Verification Commands

Frontend:

```bash
cd frontend
npm run typecheck
npm run test
npm run build
```

Backend:

```bash
cd backend
uv run pytest
```

---

## 10. Visual QA

至少检查：

- 390px 宽度
- 360px 左右窄屏

检查项：

- 底部导航不遮挡页面内容
- chat 输入区 safe-area 正常
- 中文文案不溢出、不重叠
- 卡片和按钮尺寸稳定
- loading/empty/error 状态视觉完整
- 五个主页面明显符合 Figma 气质，但不要求像素级一致

---

## 11. Acceptance Criteria

改版完成时必须满足：

- `/chat`, `/dashboard`, `/record`, `/album`, `/profile` 五个主路由在 mock mode 可用
- `/record` 能真实创建喂养、睡眠、生长、健康 4 类记录
- 底部导航为 `管家 / 成长 / 记录 / 相册 / 家庭`
- dashboard 聚焦趋势和摘要，不再作为完整记录管理页
- 尿布、趴玩本轮不显示、不建模
- 当前核心行为没有回归：auth、chat streaming、image upload、album upload/viewer、profile management
- typecheck、tests、build 通过
- 移动端视觉 QA 无明显遮挡、溢出或文本重叠

---

## 12. Implementation Sequence

建议后续实现顺序：

1. 补 backend tracker create API 与测试
2. 补 frontend API client create methods 与 mock mode
3. 更新 theme tokens 与共享基础组件
4. 更新 `TopBar`/`TabBar` 和 5-tab 路由 shell
5. 新增 `/record` 页面和记录表单
6. 改版 `/dashboard`
7. 改版 `/chat`
8. 改版 `/album`
9. 改版 `/profile`
10. 跑完整自动化验证和视觉 QA
