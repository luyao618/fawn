# Fawn Design System

## 1. Visual Theme & Atmosphere

Fawn 是一个私有化家庭育儿 Agent，视觉语言传达"温暖、可信赖、专业但不冰冷"。整体风格借鉴 WeChat 的移动端 IM 交互范式，结合 Intercom 的对话式 UI tokens，为育儿场景定制。

页面基于暖白画布（`#FFF9F4`）构建，搭配柔和炭色文字（`#2C2C2E`），营造温馨的家庭感。品牌色 Fawn Amber（`#D4956A`）取自小鹿毛色，作为核心强调色贯穿全局。辅助色 Sage Green（`#7FB685`）代表生长与健康，用于正向反馈和数据可视化。

字体采用系统原生字体栈，中英文混排优先保证可读性。移动端最小触控区域 44px，所有交互元素遵循 iOS Human Interface Guidelines 的触控尺寸要求。

界面圆角统一为 16px（卡片）和 20px（气泡），营造柔和亲和的视觉感受，与 Intercom 的锐利 4px 工业风形成差异——育儿场景需要更温暖的圆润感。

**Key Characteristics:**
- 暖白画布（`#FFF9F4`）+ 燕麦色边框（`#E5DED5`），Intercom 暖色系继承
- 系统字体栈，中文优先，无需加载自定义字体
- Fawn Amber（`#D4956A`）为唯一品牌强调色
- 大圆角设计：16px 卡片、20px 气泡、24px 底部输入栏
- 安全警告使用独立的红色警示系统，视觉上与正常对话明确区隔
- WeChat 式底部 Tab 导航 + 底部固定输入栏
- 最小触控区域 44×44px，Mobile-First

---

## 2. Color Palette & Roles

### Brand
- **Fawn Amber** (`#D4956A`): 品牌主色，用户气泡背景、主按钮、Tab 选中态、关键强调
- **Fawn Amber Light** (`#F2DFD0`): 主色浅变体，用于轻量背景、选中态底色
- **Sage Green** (`#7FB685`): 辅助色，正向反馈、生长数据、健康指标正常态
- **Sage Green Light** (`#DFF0E2`): 辅助色浅变体，成功提示背景

### Neutral（暖色调，继承 Intercom 暖灰体系）
- **Soft Charcoal** (`#2C2C2E`): 主文字色
- **Dark Gray** (`#636366`): 次要文字、时间戳、辅助说明
- **Mid Gray** (`#8E8E93`): 占位符文字、禁用态
- **Oat Border** (`#E5DED5`): 边框、分割线（Intercom 暖燕麦色）
- **Warm Gray** (`#F2EDE8`): Agent 气泡背景、卡片次级背景
- **Warm Cream** (`#FFF9F4`): 页面画布背景
- **Pure White** (`#FFFFFF`): 卡片主背景、输入框背景

### Semantic
- **Safety Red** (`#E25B45`): 红旗警告、医疗提醒、危险操作
- **Safety Red Light** (`#FDEEEB`): 安全警告卡片背景
- **Warning Amber** (`#F0A030`): 候选里程碑确认、注意提示
- **Warning Amber Light** (`#FFF3E0`): 警告提示背景
- **Info Blue** (`#5B9BD5`): 信息提示、链接、知识来源标注
- **Info Blue Light** (`#EBF3FB`): 信息卡片背景

### Data Visualization（数据看板专用）
- **Chart Primary** (`#D4956A`): 主数据线（体重）
- **Chart Secondary** (`#7FB685`): 副数据线（身高）
- **Chart Tertiary** (`#5B9BD5`): 第三数据线（头围）
- **Chart Reference** (`#C8C0B8`): WHO 参考线
- **Percentile Band** (`rgba(212, 149, 106, 0.1)`): 百分位区间填充

### Role Colors（家庭成员角色标识）
- **Mom** (`#D4956A`): 妈妈 — Fawn Amber
- **Dad** (`#5B9BD5`): 爸爸 — Info Blue
- **Grandma** (`#B07CC6`): 奶奶/外婆 — 柔紫
- **Grandpa** (`#6BAF8D`): 爷爷/外公 — 深绿
- **Agent** (`#8E8E93`): Fawn Agent — Mid Gray

---

## 3. Typography Rules

### Font Stack
```css
--font-primary: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
                "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
--font-mono: "SF Mono", "Menlo", "Monaco", "Courier New", monospace;
```

### Hierarchy

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Page Title | 20px | 600 | 1.4 | 页面标题（数据看板、相册等） |
| Section Title | 17px | 600 | 1.4 | 卡片标题、分区标题 |
| Body | 16px | 400 | 1.5 | 对话气泡正文、常规内容 |
| Body Emphasis | 16px | 600 | 1.5 | 气泡中加粗关键信息 |
| Secondary | 14px | 400 | 1.4 | 辅助说明、知识来源标注 |
| Caption | 12px | 400 | 1.3 | 时间戳、角色标签、状态文字 |
| Tab Label | 10px | 500 | 1.2 | 底部 Tab 文字 |
| Data Value | 28px | 700 | 1.2 | 数据看板核心数字（4.2kg） |
| Data Unit | 14px | 400 | 1.2 | 数据单位（kg、cm） |

### Chinese Typography Notes
- 中文正文不使用 letter-spacing（与 Intercom 英文负间距策略不同）
- 中英混排时英文自动使用 font-stack 中的西文字体
- 数字和单位使用等宽字体 `--font-mono` 对齐

---

## 4. Component Stylings

### 4.1 Chat Bubbles（对话气泡 — WeChat 范式）

**Agent Bubble（左侧）**
```
┌──────────────────────────┐
│  Fawn Agent 头像  │ 气泡内容   │
│  (36px 圆形)     │           │
└──────────────────────────┘
```
- Background: `#F2EDE8`（Warm Gray）
- Text: `#2C2C2E`
- Border-radius: 20px（左上 4px，其余 20px）
- Max-width: 75vw
- Padding: 12px 16px
- Font: 16px/1.5

**User Bubble（右侧）**
- Background: `#D4956A`（Fawn Amber）
- Text: `#FFFFFF`
- Border-radius: 20px（右上 4px，其余 20px）
- Max-width: 75vw
- Padding: 12px 16px

**Safety Alert Card（嵌入对话流的红旗警告）**
- Background: `#FDEEEB`
- Border-left: 3px solid `#E25B45`
- Border-radius: 12px
- Icon: 红色警示图标
- 内容结构：警告文案 + "建议尽快咨询医生/就医" 固定提醒
- Max-width: 85vw

**Data Card（嵌入对话流的数据卡片）**
- Background: `#FFFFFF`
- Border: 1px solid `#E5DED5`
- Border-radius: 12px
- Shadow: `0 1px 3px rgba(0, 0, 0, 0.04)`
- 内容：迷你图表、统计摘要、WHO 百分位结果等
- Max-width: 85vw

### 4.2 Bottom Input Bar（底部输入栏 — WeChat 范式）

```
┌──────────────────────────────────────┐
│  [+]  │  输入框...          │  发送  │
│  附加  │                    │  按钮  │
└──────────────────────────────────────┘
```

- Position: fixed bottom
- Background: `#FFFFFF`
- Border-top: 1px solid `#E5DED5`
- Padding: 8px 12px（safe-area-inset-bottom）
- 输入框: Background `#F2EDE8`, border-radius 20px, padding 8px 16px
- 发送按钮: Background `#D4956A`, 圆形 36px, 白色箭头图标
- 发送按钮禁用态: Background `#E5DED5`
- [+] 按钮: 展开附加功能（拍照、相册选择）

### 4.3 Bottom Tab Bar（底部导航 — 4 个 Tab）

```
┌──────────────────────────────────────┐
│   对话    │   数据    │   相册   │  我的  │
│   💬     │   📊     │   📷    │  👤   │
└──────────────────────────────────────┘
```

- Position: fixed bottom（与输入栏互斥，对话页显示输入栏，其他页显示 Tab）
- Background: `#FFFFFF`
- Border-top: 1px solid `#E5DED5`
- Height: 49px + safe-area-inset-bottom
- 选中态: icon + text 颜色 `#D4956A`
- 未选中: icon + text 颜色 `#8E8E93`
- Tab icon: 24px, label: 10px

### 4.4 Buttons

**Primary**
- Background: `#D4956A`
- Text: `#FFFFFF`, 16px, weight 600
- Padding: 12px 24px
- Border-radius: 12px
- Active: opacity 0.85（移动端无 hover，用 active 态）

**Secondary**
- Background: `#FFFFFF`
- Text: `#D4956A`, 16px, weight 600
- Border: 1px solid `#D4956A`
- Border-radius: 12px
- Active: background `#F2DFD0`

**Danger**
- Background: `#E25B45`
- Text: `#FFFFFF`
- Border-radius: 12px
- 仅用于不可逆操作确认

**Text Button**
- Background: transparent
- Text: `#D4956A`, 16px
- 用于次要操作、取消

### 4.5 Cards（信息卡片）

**Standard Card**
- Background: `#FFFFFF`
- Border: 1px solid `#E5DED5`
- Border-radius: 16px
- Padding: 16px
- Shadow: `0 1px 3px rgba(0, 0, 0, 0.04)`

**Data Summary Card（数据看板用）**
- 同 Standard Card
- 内含: 标题（14px, `#636366`）+ 核心数值（28px, `#2C2C2E`, mono）+ 趋势指示

**Photo Card（相册用）**
- Border-radius: 12px
- 无边框
- 底部 gradient overlay 显示日期/标签

### 4.6 Avatar（头像）

**Chat Avatar**
- Size: 36px
- Border-radius: 50%
- 带角色色环: 2px solid [Role Color]

**Profile Avatar**
- Size: 64px
- Border-radius: 50%

**Agent Avatar**
- 使用 Fawn logo/小鹿图标
- Background: `#F2EDE8`
- 固定样式，不使用角色色环

### 4.7 Time Separator（对话时间分隔符 — WeChat 范式）

- 居中显示
- Text: `#8E8E93`, 12px
- Background: `rgba(142, 142, 147, 0.12)`, border-radius 10px, padding 2px 8px
- 规则：同一分钟内的消息不重复显示；超过 5 分钟间隔显示时间

### 4.8 Typing Indicator（输入中指示器）

- Agent 头像 + 三个渐变圆点动画
- Dot: 6px, `#8E8E93`, 依次透明度变化动画
- 位于对话流中 Agent 气泡位置

### 4.9 Quick Action Chips（快捷操作标签）

- 对话页底部输入栏上方，横向可滚动
- Background: `#FFFFFF`, border: 1px solid `#E5DED5`, border-radius: 16px
- Text: `#636366`, 14px
- Padding: 6px 14px
- Active: background `#F2DFD0`, border-color `#D4956A`
- 内容示例: "记录喂奶", "今天体重", "睡眠情况", "查看生长曲线"

---

## 5. Layout Principles

### Spacing Scale
4px, 8px, 12px, 16px, 20px, 24px, 32px, 48px

### Safe Areas
```css
padding-bottom: calc(constant(safe-area-inset-bottom) + [bar-height]);
padding-bottom: calc(env(safe-area-inset-bottom) + [bar-height]);
```

### Chat Layout（对话页）
```
┌─────────────────────────┐
│  顶部栏 44px             │ 标题 + 历史对话入口
├─────────────────────────┤
│                         │
│  消息流                  │ flex-grow, overflow-y scroll
│  (上滑加载更多)          │ 下拉加载历史消息
│                         │
│  ┌─ Agent 气泡 ─────┐   │
│  └──────────────────┘   │
│         ┌─ 用户气泡 ─┐  │
│         └────────────┘  │
│  ┌─ 数据卡片 ────────┐  │
│  └──────────────────┘   │
│                         │
├─────────────────────────┤
│  快捷操作 Chips (可选)    │ 横向滚动
├─────────────────────────┤
│  输入栏                  │ fixed bottom + safe area
└─────────────────────────┘
```

### Dashboard Layout（数据看板页）
```
┌─────────────────────────┐
│  顶部栏 44px             │
├─────────────────────────┤
│  宝宝信息卡片             │ 头像 + 月龄 + 最新数据
├─────────────────────────┤
│  生长曲线图               │ 可切换 体重/身高/头围
├─────────────────────────┤
│  喂养统计 │ 睡眠统计      │ 2 列网格
├─────────────────────────┤
│  健康时间线               │ 纵向时间线
├─────────────────────────┤
│  Tab Bar                 │
└─────────────────────────┘
```

### Page Widths
- 设计基准: 375px (iPhone SE/8 尺寸)
- 最大内容宽度: 100vw（Mobile-First，无桌面端适配需求）
- 内容左右 padding: 16px

---

## 6. Depth & Elevation

采用极简阴影策略，保持界面清爽：

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 | none | 气泡、内联元素 |
| 1 | `0 1px 3px rgba(0,0,0,0.04)` | 卡片、输入框 |
| 2 | `0 4px 12px rgba(0,0,0,0.08)` | 浮层、弹窗、底部操作面板 |
| 3 | `0 8px 24px rgba(0,0,0,0.12)` | 全屏 Modal（照片预览） |

主要通过背景色差异和边框建立层次（Intercom 暖色边框体系），而非阴影堆叠。

---

## 7. Motion & Interaction

### Transitions
- 默认过渡: `150ms ease-out`（按钮状态、颜色变化）
- 页面切换: `250ms ease-in-out`（Tab 切换）
- 气泡出现: `200ms ease-out`（从底部轻微上移 + 淡入）

### Chat Interactions（WeChat 范式）
- 下拉加载历史消息: 顶部 loading spinner
- 新消息到达: 气泡从底部滑入，如果用户已滚动到上方则显示"有新消息"提示条
- 长按气泡: 复制文本（不做更多操作，保持简洁）
- 图片气泡点击: 全屏预览（Level 3 elevation）

### Pull-to-Refresh
- 对话页上拉加载更多历史
- 数据看板下拉刷新

### Haptic Feedback
- 发送消息: light impact
- 安全警告出现: notification warning

---

## 8. Iconography

- 风格: SF Symbols 或 Lucide Icons（线性风格，stroke-width 1.5px）
- Size: 24px（Tab bar, 操作按钮）, 20px（内联图标）, 16px（辅助图标）
- Color: 跟随所在上下文的文字颜色

### Key Icons
| Icon | Usage |
|------|-------|
| message-circle | 对话 Tab |
| bar-chart-2 | 数据 Tab |
| image | 相册 Tab |
| user | 我的 Tab |
| plus-circle | 输入栏附加按钮 |
| send | 发送按钮 |
| camera | 拍照 |
| alert-triangle | 安全警告 |
| clock | 时间戳、历史 |
| search | 搜索 |
| chevron-left | 返回 |

---

## 9. Do's and Don'ts

### Do
- 使用暖色系 neutral（`#F2EDE8`, `#E5DED5`），保持 Intercom 的温暖基调
- Agent 气泡使用 Warm Gray（`#F2EDE8`），用户气泡使用 Fawn Amber（`#D4956A`）
- 安全警告使用独立视觉语言（红色边框 + 浅红背景），与正常对话明确区分
- 所有可交互元素最小 44×44px 触控区域
- 数据数值使用 mono 字体，保证对齐
- 每个家庭成员头像带角色色环，一眼识别
- 对话中嵌入的数据卡片使用白色背景 + 边框，与气泡区分
- 中文排版使用标准字间距（不套用 Intercom 的负 letter-spacing）

### Don't
- 不要使用冷灰色（`#f5f5f5` 等）——全部换成暖色调
- 不要在安全警告中使用品牌色——安全和品牌的视觉语言必须独立
- 不要使用小于 12px 的文字
- 不要给气泡加阴影——气泡通过背景色区分，不需要 elevation
- 不要使用 Intercom 的 4px 锐角圆角——育儿场景需要 12px+ 的柔和圆角
- 不要使用 scale 动画（Intercom 的 scale(1.1) hover）——移动端无 hover，且风格偏工业感
- 不要在对话流中使用纯色分割线——用时间分隔符和间距代替
- 不要让数据卡片占满屏幕宽度——保留边距，让它看起来像嵌入的卡片而非页面元素

---

## 10. Responsive Behavior

Mobile-First 单一断点策略（Fawn 不需要桌面端适配）：

| Breakpoint | Behavior |
|------------|----------|
| < 375px | 小屏设备，气泡 max-width 从 75vw 调至 85vw，卡片全宽 |
| 375px–428px | 标准移动端（设计基准） |
| > 428px | 大屏手机/小平板，内容居中，max-width 428px |

---

## 11. Dark Mode

暂不实现。后续如需支持，色彩映射策略：

| Light | Dark |
|-------|------|
| `#FFF9F4` (canvas) | `#1C1C1E` |
| `#FFFFFF` (card) | `#2C2C2E` |
| `#F2EDE8` (agent bubble) | `#3A3A3C` |
| `#2C2C2E` (text) | `#F5F5F5` |
| `#D4956A` (brand) | `#D4956A`（保持不变） |
| `#E25B45` (safety) | `#E25B45`（保持不变） |

---

## 12. Agent Prompt Guide

### Quick Color Reference
- Text: Soft Charcoal (`#2C2C2E`)
- Background: Warm Cream (`#FFF9F4`)
- Brand Accent: Fawn Amber (`#D4956A`)
- Agent Bubble: Warm Gray (`#F2EDE8`)
- User Bubble: Fawn Amber (`#D4956A`) + white text
- Border: Oat (`#E5DED5`)
- Safety: Red (`#E25B45`) + light red bg (`#FDEEEB`)
- Success: Sage Green (`#7FB685`)

### Example Component Prompts

- "Create a mobile chat interface: warm cream (#FFF9F4) background. Agent messages left-aligned with #F2EDE8 bubbles (20px radius, top-left 4px). User messages right-aligned with #D4956A bubbles and white text. Bottom fixed input bar with #F2EDE8 input field (20px radius) and #D4956A circular send button."

- "Create a safety alert card embedded in chat: #FDEEEB background, 3px left border #E25B45, 12px radius. Red alert-triangle icon, warning text in #2C2C2E, fixed '建议尽快咨询医生' prompt in #E25B45 bold."

- "Create a baby growth data card embedded in chat: white background, 1px #E5DED5 border, 12px radius. Title '体重记录' in 14px #636366. Value '4.2kg' in 28px #2C2C2E mono font. Subtitle 'WHO P35，正常范围' in 14px #7FB685."

- "Create bottom tab bar: white background, top border 1px #E5DED5. Four tabs with 24px Lucide icons + 10px labels. Active tab color #D4956A, inactive #8E8E93. Tabs: 对话(message-circle), 数据(bar-chart-2), 相册(image), 我的(user)."

- "Create a family member avatar: 36px circle with 2px solid ring in role color (Mom=#D4956A, Dad=#5B9BD5, Grandma=#B07CC6). Agent avatar uses a deer icon on #F2EDE8 background with #8E8E93 ring."
