# Fawn Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fawn's Mobile-First frontend with Next.js 15, implementing chat UI, dashboard, album, and profile pages following the DESIGN.md design system.

**Architecture:** Next.js 15 App Router with Zustand for client state, mock API layer for backend-independent development, TDD with Vitest + React Testing Library. All pages use a shared layout shell with bottom TabBar navigation (WeChat IM paradigm + Intercom warm color tokens).

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Zustand, Recharts, Lucide React, date-fns, clsx + tailwind-merge, Vitest + React Testing Library


**Commit Protocol:** All commits must use structured format with trailers:
```
feat(frontend): <subject>

<body>

Constraint: <any constraints or design decisions>
Tested: <what was tested>
Not-tested: <what was not tested>

Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>
```

> **IMPORTANT for executors:** Every `git commit` command in this plan shows only a shorthand subject line for brevity. You **MUST** expand each commit into the full structured format above, adding the body, Constraint, Tested, and Not-tested trailers based on the work done in that task. The shorthand is a template, not the final message.

---

## File Structure

**Lib / Core:**
- `frontend/src/lib/utils.ts` — `cn()` utility (clsx + tailwind-merge)
- `frontend/src/lib/types.ts` — TypeScript type definitions
- `frontend/src/lib/mock-data.ts` — Mock data (Chinese content)
- `frontend/src/lib/api.ts` — Mock API client
- `frontend/src/lib/api.test.ts` — API tests
- `frontend/src/lib/auth-store.ts` — Zustand auth store
- `frontend/src/lib/auth-store.test.ts` — Auth store tests
- `frontend/src/lib/chat-store.ts` — Zustand chat store
- `frontend/src/lib/chat-store.test.ts` — Chat store tests

**Layout:**
- `frontend/src/app/layout.tsx` — Root layout (html lang="zh-CN")
- `frontend/src/app/page.tsx` — Root redirect to /chat
- `frontend/src/app/globals.css` — CSS custom properties (design tokens)
- `frontend/src/app/login/page.tsx` — Login page
- `frontend/src/app/(main)/layout.tsx` — Main layout with TabBar
- `frontend/src/components/auth/AuthGuard.tsx` — Client-side auth guard

**Layout Components:**
- `frontend/src/components/layout/TabBar.tsx` — Bottom tab navigation
- `frontend/src/components/layout/TabBar.test.tsx`
- `frontend/src/components/layout/TopBar.tsx` — Top navigation bar
- `frontend/src/components/layout/TopBar.test.tsx`

**UI Components:**
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/components/ui/Button.test.tsx`
- `frontend/src/components/ui/Card.tsx`
- `frontend/src/components/ui/Card.test.tsx`
- `frontend/src/components/ui/Avatar.tsx`
- `frontend/src/components/ui/Avatar.test.tsx`

**Chat Components:**
- `frontend/src/components/chat/MessageBubble.tsx`
- `frontend/src/components/chat/MessageBubble.test.tsx`
- `frontend/src/components/chat/SafetyAlert.tsx`
- `frontend/src/components/chat/SafetyAlert.test.tsx`
- `frontend/src/components/chat/DataCard.tsx`
- `frontend/src/components/chat/DataCard.test.tsx`
- `frontend/src/components/chat/ChatInput.tsx`
- `frontend/src/components/chat/ChatInput.test.tsx`
- `frontend/src/components/chat/TimeSeparator.tsx`
- `frontend/src/components/chat/TimeSeparator.test.tsx`
- `frontend/src/components/chat/TypingIndicator.tsx`
- `frontend/src/components/chat/TypingIndicator.test.tsx`
- `frontend/src/components/chat/QuickActionChips.tsx`
- `frontend/src/components/chat/QuickActionChips.test.tsx`
- `frontend/src/components/chat/MessageList.tsx`
- `frontend/src/components/chat/MessageList.test.tsx`

**Chat Pages:**
- `frontend/src/app/(main)/chat/page.tsx`
- `frontend/src/app/(main)/chat/page.test.tsx`
- `frontend/src/app/(main)/history/page.tsx`
- `frontend/src/app/(main)/history/page.test.tsx`

**Dashboard Components:**
- `frontend/src/components/dashboard/BabyInfoCard.tsx`
- `frontend/src/components/dashboard/GrowthChart.tsx`
- `frontend/src/components/dashboard/GrowthChart.test.tsx`
- `frontend/src/components/dashboard/FeedingStats.tsx`
- `frontend/src/components/dashboard/FeedingStats.test.tsx`
- `frontend/src/components/dashboard/SleepStats.tsx`
- `frontend/src/components/dashboard/HealthTimeline.tsx`
- `frontend/src/app/(main)/dashboard/page.tsx`

**Album Components:**
- `frontend/src/components/album/PhotoGrid.tsx`
- `frontend/src/components/album/PhotoGrid.test.tsx`
- `frontend/src/components/album/PhotoViewer.tsx`
- `frontend/src/components/album/UploadButton.tsx`
- `frontend/src/app/(main)/album/page.tsx`

**Profile:**
- `frontend/src/app/(main)/profile/page.tsx`
- `frontend/src/app/(main)/profile/page.test.tsx`

**Config:**
- `frontend/tailwind.config.ts` — Extended Tailwind theme
- `frontend/vitest.config.ts` — Vitest configuration
- `frontend/vitest.setup.ts` — Test setup

---

### Task 1: Project Scaffolding & Test Setup

**Files:**
- Create: `frontend/` (Next.js project via CLI)
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`

---

- [ ] **Step 1: Create Next.js project**

Run:
```bash
npx create-next-app@15 frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```
Expected: Project created in `frontend/` with TypeScript, Tailwind, ESLint, App Router, src directory.

---

- [ ] **Step 2: Install runtime dependencies**

Run:
```bash
cd frontend && npm install lucide-react recharts zustand date-fns clsx tailwind-merge
```
Expected: Packages added to `dependencies` in `package.json`.

---

- [ ] **Step 3: Install dev dependencies**

Run:
```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitejs/plugin-react jsdom
```
Expected: Packages added to `devDependencies` in `package.json`.

---

- [ ] **Step 4: Create `frontend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

- [ ] **Step 5: Create `frontend/vitest.setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest'
```

---

- [ ] **Step 6: Create `frontend/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

- [ ] **Step 7: Add test scripts to `frontend/package.json`**

Open `frontend/package.json` and add to the `"scripts"` section:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

---

- [ ] **Step 8: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build completes with no errors.

---

- [ ] **Step 9: Commit**

```bash
git add frontend/
git commit -m "$(cat <<'COMMITEOF'
feat(frontend): scaffold Next.js 15 project with TypeScript, Tailwind, and Vitest

Initialize frontend directory with create-next-app@15 App Router template.
Configure Vitest with React Testing Library for TDD workflow.
Install runtime dependencies: Zustand, Recharts, Lucide React, date-fns, clsx, tailwind-merge.

Constraint: pinned to create-next-app@15, import alias set to @/*
Tested: npm run build passes
Not-tested: no runtime UI tests yet

Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>
COMMITEOF
)"
```

---

### Task 2: Design Tokens & Global Styles

**Files:**
- Rewrite: `frontend/src/app/globals.css`
- Rewrite: `frontend/tailwind.config.ts`

---

- [ ] **Step 1: Rewrite `frontend/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Brand */
  --color-fawn-amber: #D4956A;
  --color-fawn-amber-light: #F2DFD0;
  --color-sage-green: #7FB685;
  --color-sage-green-light: #DFF0E2;

  /* Neutral */
  --color-soft-charcoal: #2C2C2E;
  --color-dark-gray: #636366;
  --color-mid-gray: #8E8E93;
  --color-oat-border: #E5DED5;
  --color-warm-gray: #F2EDE8;
  --color-warm-cream: #FFF9F4;
  --color-pure-white: #FFFFFF;

  /* Semantic */
  --color-safety-red: #E25B45;
  --color-safety-red-light: #FDEEEB;
  --color-warning-amber: #F0A030;
  --color-warning-amber-light: #FFF3E0;
  --color-info-blue: #5B9BD5;
  --color-info-blue-light: #EBF3FB;

  /* Role colors */
  --color-role-mom: #D4956A;
  --color-role-dad: #5B9BD5;
  --color-role-grandma: #B07CC6;
  --color-role-grandpa: #6BAF8D;
  --color-role-agent: #8E8E93;

  /* Chart colors */
  --color-chart-primary: #D4956A;
  --color-chart-secondary: #7FB685;
  --color-chart-tertiary: #5B9BD5;
  --color-chart-reference: #C8C0B8;
  --color-percentile-band: rgba(212, 149, 106, 0.1);

  /* Font stacks */
  --font-primary: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
                  "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: "SF Mono", "Menlo", "Monaco", "Courier New", monospace;

  /* Shadows */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-float: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-modal: 0 8px 24px rgba(0, 0, 0, 0.12);

  /* Transitions */
  --transition-fast: 150ms ease-out;
  --transition-normal: 250ms ease-in-out;
  --transition-bubble: 200ms ease-out;
}

body {
  font-family: var(--font-primary);
  color: var(--color-soft-charcoal);
  background-color: var(--color-warm-cream);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}
```

---

- [ ] **Step 2: Rewrite `frontend/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'fawn-amber': 'var(--color-fawn-amber)',
        'fawn-amber-light': 'var(--color-fawn-amber-light)',
        'sage-green': 'var(--color-sage-green)',
        'sage-green-light': 'var(--color-sage-green-light)',
        'soft-charcoal': 'var(--color-soft-charcoal)',
        'dark-gray': 'var(--color-dark-gray)',
        'mid-gray': 'var(--color-mid-gray)',
        'oat-border': 'var(--color-oat-border)',
        'warm-gray': 'var(--color-warm-gray)',
        'warm-cream': 'var(--color-warm-cream)',
        'pure-white': 'var(--color-pure-white)',
        'safety-red': 'var(--color-safety-red)',
        'safety-red-light': 'var(--color-safety-red-light)',
        'warning-amber': 'var(--color-warning-amber)',
        'warning-amber-light': 'var(--color-warning-amber-light)',
        'info-blue': 'var(--color-info-blue)',
        'info-blue-light': 'var(--color-info-blue-light)',
        'role-mom': 'var(--color-role-mom)',
        'role-dad': 'var(--color-role-dad)',
        'role-grandma': 'var(--color-role-grandma)',
        'role-grandpa': 'var(--color-role-grandpa)',
        'role-agent': 'var(--color-role-agent)',
        'chart-primary': 'var(--color-chart-primary)',
        'chart-secondary': 'var(--color-chart-secondary)',
        'chart-tertiary': 'var(--color-chart-tertiary)',
        'chart-reference': 'var(--color-chart-reference)',
      },
      fontFamily: {
        primary: ['var(--font-primary)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        bubble: '20px',
        card: '16px',
        chip: '16px',
        input: '20px',
        btn: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.04)',
        float: '0 4px 12px rgba(0, 0, 0, 0.08)',
        modal: '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
      maxWidth: {
        mobile: '428px',
      },
    },
  },
  plugins: [],
}

export default config
```

---

- [ ] **Step 3: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build completes with no errors.

---

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/globals.css frontend/tailwind.config.ts
git commit -m "feat(frontend): add design tokens and Tailwind theme extending DESIGN.md spec"
```

---

### Task 3: TypeScript Types & Mock Data

**Files:**
- Create: `frontend/src/lib/types.ts`
- Create: `frontend/src/lib/mock-data.ts`
- Create: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/api.test.ts`

---

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/api.test.ts
import { describe, it, expect } from 'vitest'
import { login, getMessages, getBabyProfile, getGrowthRecords } from './api'

describe('api client', () => {
  it('login returns user and token for valid credentials', async () => {
    const result = await login('mama', 'password123')
    expect(result).toHaveProperty('user')
    expect(result).toHaveProperty('token')
    expect(result.user.name).toBe('妈妈')
    expect(typeof result.token).toBe('string')
    expect(result.token.length).toBeGreaterThan(0)
  })

  it('login throws for invalid credentials', async () => {
    await expect(login('nobody', 'wrong')).rejects.toThrow()
  })

  it('getMessages returns array of messages', async () => {
    const messages = await getMessages('conv-1')
    expect(Array.isArray(messages)).toBe(true)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]).toHaveProperty('id')
    expect(messages[0]).toHaveProperty('role')
    expect(messages[0]).toHaveProperty('content')
    expect(messages[0]).toHaveProperty('createdAt')
  })

  it('getBabyProfile returns baby profile', async () => {
    const baby = await getBabyProfile()
    expect(baby).toHaveProperty('id')
    expect(baby).toHaveProperty('name')
    expect(baby.name).toBe('小鹿')
    expect(baby.gender).toBe('male')
  })

  it('getGrowthRecords returns array of records', async () => {
    const records = await getGrowthRecords('baby-1')
    expect(Array.isArray(records)).toBe(true)
    expect(records.length).toBeGreaterThan(0)
    expect(records[0]).toHaveProperty('weight')
  })
})
```

---

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/api.test.ts`
Expected: FAIL with "Cannot find module './api'"

---

- [ ] **Step 3: Create `frontend/src/lib/types.ts`**

```typescript
// frontend/src/lib/types.ts

export interface User {
  id: string
  name: string
  role: 'admin' | 'parent' | 'family'
  avatarUrl?: string
}

export type RoleType = 'admin' | 'parent' | 'family'

export interface BabyProfile {
  id: string
  name: string
  gender: 'male' | 'female'
  birthDate: string
  birthWeight: number
  birthHeight: number
  birthHeadCirc: number
  isPremature: boolean
  gestationalWeeks?: number
}

export interface MessageMetadata {
  safetyFlag?: boolean
  dataCard?: DataCardContent
  imageUrl?: string
}

export interface DataCardContent {
  type: 'growth' | 'feeding' | 'sleep'
  title: string
  value: string
  unit: string
  subtitle?: string
  status?: 'normal' | 'warning' | 'danger'
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'agent'
  content: string
  contentType: 'text' | 'image' | 'safety_alert' | 'data_card'
  createdAt: string
  metadata?: MessageMetadata
}

export interface Conversation {
  id: string
  userId: string
  startedAt: string
  endedAt?: string
  summary?: string
  messageCount: number
}

export interface GrowthRecord {
  id: string
  babyId: string
  date: string
  weight?: number
  height?: number
  headCirc?: number
  whoPercentile?: {
    weight?: number
    height?: number
    headCirc?: number
  }
}

export interface FeedingRecord {
  id: string
  babyId: string
  time: string
  method: 'breast' | 'formula' | 'solid'
  amount?: number
  note?: string
}

export interface SleepRecord {
  id: string
  babyId: string
  startTime: string
  endTime: string
  nightWakings: number
}

export interface HealthRecord {
  id: string
  babyId: string
  date: string
  type: 'vaccine' | 'illness' | 'visit'
  title: string
  description: string
}

export interface PhotoTag {
  label: string
  confidence: number
  source: 'ai' | 'manual'
}

export interface Photo {
  id: string
  babyId: string
  url: string
  thumbnailUrl: string
  uploadedAt: string
  uploadedBy: string
  tags: PhotoTag[]
  milestone?: {
    type: string
    confirmed: boolean
    confidence: number
  }
}

export interface ProfileItem {
  id: string
  userId: string
  content: string
  sourceConversationId: string
  createdAt: string
  updatedAt: string
}

export const ROLE_COLORS: Record<string, string> = {
  mom: '#D4956A',
  dad: '#5B9BD5',
  grandma: '#B07CC6',
  grandpa: '#6BAF8D',
  agent: '#8E8E93',
}
```

---

- [ ] **Step 4: Create `frontend/src/lib/mock-data.ts`**

```typescript
// frontend/src/lib/mock-data.ts
import type {
  User,
  BabyProfile,
  Message,
  Conversation,
  GrowthRecord,
  FeedingRecord,
  SleepRecord,
  HealthRecord,
  Photo,
  ProfileItem,
} from './types'

export const mockUsers: User[] = [
  {
    id: 'user-1',
    name: '妈妈',
    role: 'parent',
    avatarUrl: undefined,
  },
  {
    id: 'user-2',
    name: '爸爸',
    role: 'parent',
    avatarUrl: undefined,
  },
  {
    id: 'user-3',
    name: '奶奶',
    role: 'family',
    avatarUrl: undefined,
  },
]

export const mockBaby: BabyProfile = {
  id: 'baby-1',
  name: '小鹿',
  gender: 'male',
  birthDate: '2026-05-15',
  birthWeight: 3.2,
  birthHeight: 50.5,
  birthHeadCirc: 34.0,
  isPremature: false,
}

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: '宝宝今天体重 4.2kg，是不是偏轻了？',
    contentType: 'text',
    createdAt: '2026-07-20T09:00:00Z',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    role: 'agent',
    content: '已记录小鹿的体重 4.2kg。根据 WHO 生长标准，小鹿目前体重处于同月龄宝宝的第 35 百分位，属于正常范围。',
    contentType: 'data_card',
    createdAt: '2026-07-20T09:00:05Z',
    metadata: {
      dataCard: {
        type: 'growth',
        title: '体重记录',
        value: '4.2',
        unit: 'kg',
        subtitle: 'WHO P35，正常范围',
        status: 'normal',
      },
    },
  },
  {
    id: 'msg-3',
    conversationId: 'conv-1',
    role: 'user',
    content: '宝宝发烧 38.5 度，帮我记一下',
    contentType: 'text',
    createdAt: '2026-07-20T10:00:00Z',
  },
  {
    id: 'msg-4',
    conversationId: 'conv-1',
    role: 'agent',
    content: '已记录体温 38.5°C。',
    contentType: 'safety_alert',
    createdAt: '2026-07-20T10:00:05Z',
    metadata: {
      safetyFlag: true,
    },
  },
  {
    id: 'msg-5',
    conversationId: 'conv-1',
    role: 'user',
    content: '宝宝今天喝了 120ml 奶',
    contentType: 'text',
    createdAt: '2026-07-20T11:00:00Z',
  },
  {
    id: 'msg-6',
    conversationId: 'conv-1',
    role: 'agent',
    content: '已记录喂养：配方奶 120ml，时间 11:00。今日累计配方奶 360ml，在正常范围内。',
    contentType: 'text',
    createdAt: '2026-07-20T11:00:05Z',
  },
  {
    id: 'msg-7',
    conversationId: 'conv-1',
    role: 'user',
    content: '昨晚宝宝从 22:00 睡到今天 6:30，中间醒了 2 次',
    contentType: 'text',
    createdAt: '2026-07-20T08:00:00Z',
  },
  {
    id: 'msg-8',
    conversationId: 'conv-1',
    role: 'agent',
    content: '已记录昨晚睡眠：22:00 – 06:30，共 8.5 小时，夜醒 2 次。根据月龄参考，这个睡眠时长处于正常范围。',
    contentType: 'text',
    createdAt: '2026-07-20T08:00:05Z',
  },
  // conv-2: 睡眠相关
  {
    id: 'msg-9',
    conversationId: 'conv-2',
    role: 'user',
    content: '宝宝午睡只睡了30分钟就醒了，正常吗？',
    contentType: 'text',
    createdAt: '2026-07-19T14:00:00Z',
  },
  {
    id: 'msg-10',
    conversationId: 'conv-2',
    role: 'agent',
    content: '30分钟的午睡在2个月大的宝宝中很常见，这通常是一个睡眠周期的长度。随着月龄增长，午睡会逐渐延长。',
    contentType: 'text',
    createdAt: '2026-07-19T14:00:05Z',
  },
  // conv-3: 生长曲线
  {
    id: 'msg-11',
    conversationId: 'conv-3',
    role: 'user',
    content: '帮我看看小鹿本周的生长曲线',
    contentType: 'text',
    createdAt: '2026-07-18T10:00:00Z',
  },
  {
    id: 'msg-12',
    conversationId: 'conv-3',
    role: 'agent',
    content: '小鹿本周体重和身高均在正常范围内，体重 WHO P35，身高 WHO P40。',
    contentType: 'data_card',
    createdAt: '2026-07-18T10:00:05Z',
    metadata: {
      dataCard: {
        type: 'growth',
        title: '本周生长',
        value: '4.5',
        unit: 'kg',
        subtitle: 'WHO P35，正常',
        status: 'normal',
      },
    },
  },
  // conv-4: 发烧
  {
    id: 'msg-13',
    conversationId: 'conv-4',
    role: 'user',
    content: '宝宝额头摸起来有点烫，量了下体温37.8度',
    contentType: 'text',
    createdAt: '2026-07-18T20:00:00Z',
  },
  {
    id: 'msg-14',
    conversationId: 'conv-4',
    role: 'agent',
    content: '37.8°C属于低热。建议多喂水、保持通风，每2小时复测。如果超过38.5°C或精神不佳请及时就医。',
    contentType: 'text',
    createdAt: '2026-07-18T20:00:05Z',
  },
  // conv-5: 辅食
  {
    id: 'msg-15',
    conversationId: 'conv-5',
    role: 'user',
    content: '什么时候可以开始给宝宝添加辅食？',
    contentType: 'text',
    createdAt: '2026-07-17T09:00:00Z',
  },
  {
    id: 'msg-16',
    conversationId: 'conv-5',
    role: 'agent',
    content: 'WHO建议满6个月（约180天）开始添加辅食。小鹿目前2个月，建议等到满6个月再开始。届时可从高铁米粉开始。',
    contentType: 'text',
    createdAt: '2026-07-17T09:00:05Z',
  },
]

export const mockGrowthRecords: GrowthRecord[] = [
  {
    id: 'growth-1',
    babyId: 'baby-1',
    date: '2026-05-15',
    weight: 3.2,
    height: 50.5,
    headCirc: 34.0,
    whoPercentile: { weight: 40, height: 45, headCirc: 50 },
  },
  {
    id: 'growth-2',
    babyId: 'baby-1',
    date: '2026-05-29',
    weight: 3.8,
    height: 52.0,
    headCirc: 35.2,
    whoPercentile: { weight: 38, height: 43, headCirc: 48 },
  },
  {
    id: 'growth-3',
    babyId: 'baby-1',
    date: '2026-06-15',
    weight: 4.5,
    height: 54.5,
    headCirc: 36.8,
    whoPercentile: { weight: 35, height: 40, headCirc: 47 },
  },
  {
    id: 'growth-4',
    babyId: 'baby-1',
    date: '2026-07-01',
    weight: 5.2,
    height: 57.0,
    headCirc: 38.0,
    whoPercentile: { weight: 37, height: 42, headCirc: 49 },
  },
  {
    id: 'growth-5',
    babyId: 'baby-1',
    date: '2026-07-20',
    weight: 4.2,
    height: 58.5,
    headCirc: 38.8,
    whoPercentile: { weight: 35, height: 44, headCirc: 50 },
  },
]

export const mockFeedingRecords: FeedingRecord[] = [
  {
    id: 'feed-1',
    babyId: 'baby-1',
    time: '2026-07-20T07:00:00Z',
    method: 'formula',
    amount: 120,
    note: '吃得很好',
  },
  {
    id: 'feed-2',
    babyId: 'baby-1',
    time: '2026-07-20T10:00:00Z',
    method: 'breast',
    note: '左侧 15 分钟，右侧 10 分钟',
  },
  {
    id: 'feed-3',
    babyId: 'baby-1',
    time: '2026-07-20T13:00:00Z',
    method: 'formula',
    amount: 100,
  },
  {
    id: 'feed-4',
    babyId: 'baby-1',
    time: '2026-07-20T16:30:00Z',
    method: 'breast',
    note: '睡前喂',
  },
  {
    id: 'feed-5',
    babyId: 'baby-1',
    time: '2026-07-20T20:00:00Z',
    method: 'formula',
    amount: 140,
  },
]

export const mockSleepRecords: SleepRecord[] = [
  {
    id: 'sleep-1',
    babyId: 'baby-1',
    startTime: '2026-07-19T22:00:00Z',
    endTime: '2026-07-20T06:30:00Z',
    nightWakings: 2,
  },
  {
    id: 'sleep-2',
    babyId: 'baby-1',
    startTime: '2026-07-20T09:00:00Z',
    endTime: '2026-07-20T10:30:00Z',
    nightWakings: 0,
  },
  {
    id: 'sleep-3',
    babyId: 'baby-1',
    startTime: '2026-07-20T14:00:00Z',
    endTime: '2026-07-20T15:45:00Z',
    nightWakings: 0,
  },
]

export const mockHealthRecords: HealthRecord[] = [
  {
    id: 'health-1',
    babyId: 'baby-1',
    date: '2026-06-15',
    type: 'vaccine',
    title: '乙肝疫苗第二针',
    description: '接种顺利，接种后观察 30 分钟无异常反应。',
  },
  {
    id: 'health-2',
    babyId: 'baby-1',
    date: '2026-07-10',
    type: 'illness',
    title: '低烧',
    description: '体温 37.8°C，持续约 1 天，已就医，医生建议观察，无需用药。',
  },
]

export const mockPhotos: Photo[] = [
  {
    id: 'photo-1',
    babyId: 'baby-1',
    url: 'https://placehold.co/400x400/F2EDE8/2C2C2E?text=小鹿',
    thumbnailUrl: 'https://placehold.co/200x200/F2EDE8/2C2C2E?text=小鹿',
    uploadedAt: '2026-07-01T10:00:00Z',
    uploadedBy: 'user-1',
    tags: [
      { label: '睡觉', confidence: 0.95, source: 'ai' },
      { label: '安静', confidence: 0.88, source: 'ai' },
    ],
  },
  {
    id: 'photo-2',
    babyId: 'baby-1',
    url: 'https://placehold.co/400x400/DFF0E2/2C2C2E?text=户外',
    thumbnailUrl: 'https://placehold.co/200x200/DFF0E2/2C2C2E?text=户外',
    uploadedAt: '2026-07-05T14:30:00Z',
    uploadedBy: 'user-2',
    tags: [
      { label: '户外', confidence: 0.92, source: 'ai' },
      { label: '开心', confidence: 0.85, source: 'ai' },
    ],
    milestone: {
      type: '第一次微笑',
      confirmed: false,
      confidence: 0.73,
    },
  },
  {
    id: 'photo-3',
    babyId: 'baby-1',
    url: 'https://placehold.co/400x400/F2DFD0/2C2C2E?text=洗澡',
    thumbnailUrl: 'https://placehold.co/200x200/F2DFD0/2C2C2E?text=洗澡',
    uploadedAt: '2026-07-10T19:00:00Z',
    uploadedBy: 'user-1',
    tags: [
      { label: '洗澡', confidence: 0.97, source: 'ai' },
      { label: '开心', confidence: 0.80, source: 'ai' },
    ],
  },
  {
    id: 'photo-4',
    babyId: 'baby-1',
    url: 'https://placehold.co/400x400/EBF3FB/2C2C2E?text=抬头',
    thumbnailUrl: 'https://placehold.co/200x200/EBF3FB/2C2C2E?text=抬头',
    uploadedAt: '2026-07-15T11:00:00Z',
    uploadedBy: 'user-1',
    tags: [
      { label: '趴着', confidence: 0.94, source: 'ai' },
    ],
    milestone: {
      type: '俯趴抬头',
      confirmed: true,
      confidence: 0.89,
    },
  },
]

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    userId: 'user-1',
    startedAt: '2026-07-20T08:00:00Z',
    summary: '记录了体重 4.2kg（WHO P35），喂养 360ml 配方奶，睡眠 8.5 小时夜醒 2 次。还有一次体温 38.5°C 异常记录，建议就医。',
    messageCount: 8,
  },
  {
    id: 'conv-2',
    userId: 'user-1',
    startedAt: '2026-07-19T09:00:00Z',
    endedAt: '2026-07-19T09:30:00Z',
    summary: '询问了宝宝 2 个月应该喂多少配方奶，了解了喂养间隔和每次奶量参考标准。',
    messageCount: 6,
  },
  {
    id: 'conv-3',
    userId: 'user-3',
    startedAt: '2026-07-18T15:00:00Z',
    endedAt: '2026-07-18T15:20:00Z',
    summary: '奶奶询问了今天宝宝的喂养情况，查看了当日喂养记录。',
    messageCount: 4,
  },
]

export const mockProfileItems: ProfileItem[] = [
  {
    id: 'profile-1',
    userId: 'user-1',
    content: '母乳喂养中，多次询问奶量是否足够',
    sourceConversationId: 'conv-2',
    createdAt: '2026-07-19T09:30:00Z',
    updatedAt: '2026-07-19T09:30:00Z',
  },
  {
    id: 'profile-2',
    userId: 'user-1',
    content: '比较关注宝宝睡眠质量，曾多次咨询夜醒问题',
    sourceConversationId: 'conv-1',
    createdAt: '2026-07-20T09:00:00Z',
    updatedAt: '2026-07-20T09:00:00Z',
  },
  {
    id: 'profile-3',
    userId: 'user-1',
    content: '倾向于自然育儿方式，对辅食添加时机较为谨慎',
    sourceConversationId: 'conv-2',
    createdAt: '2026-07-19T09:30:00Z',
    updatedAt: '2026-07-19T09:30:00Z',
  },
]
```

---

- [ ] **Step 5: Create `frontend/src/lib/api.ts`**

```typescript
// frontend/src/lib/api.ts
import type {
  User,
  BabyProfile,
  Message,
  Conversation,
  GrowthRecord,
  FeedingRecord,
  SleepRecord,
  HealthRecord,
  Photo,
  ProfileItem,
} from './types'
import {
  mockUsers,
  mockBaby,
  mockMessages,
  mockConversations,
  mockGrowthRecords,
  mockFeedingRecords,
  mockSleepRecords,
  mockHealthRecords,
  mockPhotos,
  mockProfileItems,
} from './mock-data'

const MOCK_CREDENTIALS: Record<string, { password: string; userId: string }> = {
  mama: { password: 'password123', userId: 'user-1' },
  baba: { password: 'password123', userId: 'user-2' },
  nainai: { password: 'password123', userId: 'user-3' },
}

function generateToken(userId: string): string {
  return `mock-token-${userId}-${Date.now()}`
}

export async function login(
  username: string,
  password: string
): Promise<{ user: User; token: string }> {
  const cred = MOCK_CREDENTIALS[username]
  if (!cred || cred.password !== password) {
    throw new Error('用户名或密码错误')
  }
  const user = mockUsers.find((u) => u.id === cred.userId)
  if (!user) {
    throw new Error('用户不存在')
  }
  return { user, token: generateToken(user.id) }
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return mockMessages.filter((m) => m.conversationId === conversationId)
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<Message> {
  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    conversationId,
    role: 'user',
    content,
    contentType: 'text',
    createdAt: new Date().toISOString(),
  }

  await new Promise((resolve) => setTimeout(resolve, 1000))

  const agentMessage: Message = {
    id: `msg-${Date.now() + 1}`,
    conversationId,
    role: 'agent',
    content: `收到你的消息："${content}"。我正在处理中，请稍候。`,
    contentType: 'text',
    createdAt: new Date().toISOString(),
  }

  return agentMessage
}

export async function getBabyProfile(): Promise<BabyProfile> {
  return mockBaby
}

export async function getGrowthRecords(babyId: string = 'baby-1'): Promise<GrowthRecord[]> {
  return mockGrowthRecords.filter((r) => r.babyId === babyId)
}

export async function getFeedingRecords(
  babyId: string = 'baby-1',
  date?: string
): Promise<FeedingRecord[]> {
  const records = mockFeedingRecords.filter((r) => r.babyId === babyId)
  if (!date) return records
  return records.filter((r) => r.time.startsWith(date))
}

export async function getSleepRecords(
  babyId: string = 'baby-1',
  date?: string
): Promise<SleepRecord[]> {
  const records = mockSleepRecords.filter((r) => r.babyId === babyId)
  if (!date) return records
  return records.filter((r) => r.startTime.startsWith(date))
}

export async function getHealthRecords(babyId: string = 'baby-1'): Promise<HealthRecord[]> {
  return mockHealthRecords.filter((r) => r.babyId === babyId)
}

export async function getPhotos(
  babyId: string = 'baby-1',
  filter?: { tag?: string; milestone?: boolean }
): Promise<Photo[]> {
  let photos = mockPhotos.filter((p) => p.babyId === babyId)
  if (filter?.milestone) {
    photos = photos.filter((p) => p.milestone !== undefined)
  }
  if (filter?.tag) {
    photos = photos.filter((p) =>
      p.tags.some((t) => t.label.includes(filter.tag!))
    )
  }
  return photos
}

export async function getConversations(userId: string = 'user-1'): Promise<Conversation[]> {
  return mockConversations.filter((c) => c.userId === userId)
}

export async function searchConversations(query: string): Promise<Conversation[]> {
  return mockConversations.filter(
    (c) => c.summary && c.summary.includes(query)
  )
}

export async function getProfileItems(userId: string = 'user-1'): Promise<ProfileItem[]> {
  return mockProfileItems.filter((p) => p.userId === userId)
}

export async function uploadPhoto(file: File): Promise<Photo> {
  await new Promise((resolve) => setTimeout(resolve, 800))
  return {
    id: `photo-${Date.now()}`,
    babyId: 'baby-1',
    url: URL.createObjectURL(file),
    thumbnailUrl: URL.createObjectURL(file),
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'user-1',
    tags: [{ label: '新照片', confidence: 0.5, source: 'ai' as const }],
  }
}

export async function getFamilyMembers(): Promise<User[]> {
  return mockUsers
}

export async function updateProfileItem(id: string, content: string): Promise<void> {
  // mock: no-op
}

export async function deleteProfileItem(id: string): Promise<void> {
  // mock: no-op
}

export async function updateBabyProfile(baby: BabyProfile): Promise<BabyProfile> {
  return baby
}
```

---

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/api.test.ts`
Expected: PASS — 5 tests passing.

---

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/mock-data.ts frontend/src/lib/api.ts frontend/src/lib/api.test.ts
git commit -m "feat(frontend): add TypeScript types, mock data, and API client with tests"
```

---

### Task 4: Auth Store & Login Page

**Files:**
- Create: `frontend/src/lib/auth-store.ts`
- Test: `frontend/src/lib/auth-store.test.ts`
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/components/auth/AuthGuard.tsx`

---

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/auth-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

vi.mock('./api', () => ({
  login: vi.fn().mockResolvedValue({
    user: { id: 'user-1', name: '妈妈', role: 'parent' },
    token: 'mock-token-user-1',
  }),
}))

describe('auth-store', () => {
  beforeEach(async () => {
    localStorageMock.clear()
    const { useAuthStore } = await import('./auth-store')
    useAuthStore.setState({ user: null, token: null, isAuthenticated: false, _hasHydrated: false })
  })

  it('initial state is unauthenticated and not hydrated', async () => {
    const { useAuthStore } = await import('./auth-store')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state._hasHydrated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
  })

  it('login sets user, token and isAuthenticated', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().login('mama', 'password123')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user).not.toBeNull()
    expect(state.user?.name).toBe('妈妈')
    expect(state.token).toBe('mock-token-user-1')
  })

  it('login persists token and user to localStorage', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().login('mama', 'password123')
    expect(localStorageMock.getItem('fawn-token')).toBe('mock-token-user-1')
    expect(localStorageMock.getItem('fawn-user')).toBe(
      JSON.stringify({ id: 'user-1', name: '妈妈', role: 'parent' })
    )
  })

  it('hydrate restores session from localStorage', async () => {
    localStorageMock.setItem('fawn-token', 'mock-token-user-1')
    localStorageMock.setItem('fawn-user', JSON.stringify({ id: 'user-1', name: '妈妈', role: 'parent' }))
    const { useAuthStore } = await import('./auth-store')
    useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state._hasHydrated).toBe(true)
    expect(state.user?.name).toBe('妈妈')
    expect(state.token).toBe('mock-token-user-1')
  })

  it('hydrate sets _hasHydrated true even with no stored session', async () => {
    const { useAuthStore } = await import('./auth-store')
    useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state._hasHydrated).toBe(true)
    expect(state.isAuthenticated).toBe(false)
  })

  it('hydrate clears corrupted localStorage gracefully', async () => {
    localStorageMock.setItem('fawn-token', 'mock-token')
    localStorageMock.setItem('fawn-user', '{invalid-json')
    const { useAuthStore } = await import('./auth-store')
    useAuthStore.getState().hydrate()
    const state = useAuthStore.getState()
    expect(state._hasHydrated).toBe(true)
    expect(state.isAuthenticated).toBe(false)
    expect(localStorageMock.getItem('fawn-token')).toBeNull()
    expect(localStorageMock.getItem('fawn-user')).toBeNull()
  })

  it('logout clears user, token and isAuthenticated', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().login('mama', 'password123')
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.user).toBeNull()
    expect(state.token).toBeNull()
  })

  it('logout removes token and user from localStorage', async () => {
    const { useAuthStore } = await import('./auth-store')
    await useAuthStore.getState().login('mama', 'password123')
    useAuthStore.getState().logout()
    expect(localStorageMock.getItem('fawn-token')).toBeNull()
    expect(localStorageMock.getItem('fawn-user')).toBeNull()
  })
})
```

---

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/auth-store.test.ts`
Expected: FAIL with "Cannot find module './auth-store'"

---

- [ ] **Step 3: Create `frontend/src/lib/auth-store.ts`**

```typescript
// frontend/src/lib/auth-store.ts
'use client'

import { create } from 'zustand'
import type { User } from './types'
import { login as apiLogin } from './api'

const TOKEN_KEY = 'fawn-token'

const USER_KEY = 'fawn-user'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean
  hydrate: () => void
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  _hasHydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem(TOKEN_KEY)
    const userJson = localStorage.getItem(USER_KEY)
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as User
        set({ user, token, isAuthenticated: true, _hasHydrated: true })
        return
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    set({ _hasHydrated: true })
  },

  login: async (username: string, password: string) => {
    const { user, token } = await apiLogin(username, password)
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ user: null, token: null, isAuthenticated: false })
  },
}))
```

---

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/auth-store.test.ts`
Expected: PASS — 5 tests passing.

---

- [ ] **Step 5: Create `frontend/src/app/login/page.tsx`**

```typescript
// frontend/src/app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      router.replace('/chat')
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--color-warm-cream)' }}
    >
      <div
        className="w-full max-w-sm rounded-card shadow-card p-8"
        style={{ backgroundColor: 'var(--color-pure-white)' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="text-4xl mb-2"
            role="img"
            aria-label="小鹿"
          >
            🦌
          </div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: 'var(--color-soft-charcoal)' }}
          >
            Fawn
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: 'var(--color-dark-gray)' }}
          >
            家庭育儿助手
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--color-soft-charcoal)' }}
            >
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              required
              className="w-full px-4 py-3 rounded-input text-base outline-none transition-all"
              style={{
                backgroundColor: 'var(--color-warm-gray)',
                color: 'var(--color-soft-charcoal)',
                border: '1px solid transparent',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-fawn-amber)'
                e.currentTarget.style.backgroundColor = 'var(--color-pure-white)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.backgroundColor = 'var(--color-warm-gray)'
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--color-soft-charcoal)' }}
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              required
              className="w-full px-4 py-3 rounded-input text-base outline-none transition-all"
              style={{
                backgroundColor: 'var(--color-warm-gray)',
                color: 'var(--color-soft-charcoal)',
                border: '1px solid transparent',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-fawn-amber)'
                e.currentTarget.style.backgroundColor = 'var(--color-pure-white)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.backgroundColor = 'var(--color-warm-gray)'
              }}
            />
          </div>

          {error && (
            <p
              className="text-sm"
              style={{ color: 'var(--color-safety-red)' }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 rounded-btn text-base font-semibold text-white transition-opacity active:opacity-85 mt-2"
            style={{
              backgroundColor:
                loading || !username || !password
                  ? 'var(--color-oat-border)'
                  : 'var(--color-fawn-amber)',
            }}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

---

- [ ] **Step 6: Create `frontend/src/components/auth/AuthGuard.tsx`**

```typescript
// frontend/src/components/auth/AuthGuard.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/auth-store'

const PUBLIC_PATHS = ['/login']

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!hasHydrated) return
    const isPublic = PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(path + '/')
    )
    if (!isPublic && !isAuthenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [hasHydrated, isAuthenticated, pathname, router])

  if (!hasHydrated) return null

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + '/')
  )

  if (!isPublic && !isAuthenticated) {
    return null
  }

  return <>{children}</>
}
```

---

- [ ] **Step 7: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build completes with no errors.

---

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/auth-store.ts frontend/src/lib/auth-store.test.ts frontend/src/app/login/page.tsx frontend/src/components/auth/AuthGuard.tsx
git commit -m "feat(frontend): add Zustand auth store, login page, and auth middleware"
```

---

### Task 5: Layout Shell

**Files:**
- Create: `frontend/src/components/layout/TabBar.tsx`
- Test: `frontend/src/components/layout/TabBar.test.tsx`
- Create: `frontend/src/components/layout/TopBar.tsx`
- Test: `frontend/src/components/layout/TopBar.test.tsx`
- Create: `frontend/src/app/(main)/layout.tsx`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`

---

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/components/layout/TabBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/chat'),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import TabBar from './TabBar'

describe('TabBar', () => {
  it('renders all four tabs', () => {
    render(<TabBar />)
    expect(screen.getByText('对话')).toBeInTheDocument()
    expect(screen.getByText('数据')).toBeInTheDocument()
    expect(screen.getByText('相册')).toBeInTheDocument()
    expect(screen.getByText('我的')).toBeInTheDocument()
  })

  it('marks the active tab based on current pathname', () => {
    render(<TabBar />)
    const chatLink = screen.getByText('对话').closest('a')
    expect(chatLink).toHaveAttribute('href', '/chat')
    // Active tab has fawn-amber color applied via data attribute or aria
    const activeTab = screen.getByRole('link', { name: /对话/ })
    expect(activeTab).toHaveAttribute('aria-current', 'page')
  })

  it('renders correct href for each tab', () => {
    render(<TabBar />)
    expect(screen.getByRole('link', { name: /数据/ })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /相册/ })).toHaveAttribute('href', '/album')
    expect(screen.getByRole('link', { name: /我的/ })).toHaveAttribute('href', '/profile')
  })
})
```

```typescript
// frontend/src/components/layout/TopBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ back: vi.fn() }),
}))

import TopBar from './TopBar'

describe('TopBar', () => {
  it('renders title', () => {
    render(<TopBar title="对话" />)
    expect(screen.getByText('对话')).toBeInTheDocument()
  })

  it('renders back button when showBack is true', () => {
    render(<TopBar title="详情" showBack />)
    expect(screen.getByRole('button', { name: /返回/ })).toBeInTheDocument()
  })

  it('does not render back button by default', () => {
    render(<TopBar title="对话" />)
    expect(screen.queryByRole('button', { name: /返回/ })).not.toBeInTheDocument()
  })

  it('renders history button when showHistory is true', () => {
    render(<TopBar title="对话" showHistory />)
    expect(screen.getByRole('button', { name: /历史/ })).toBeInTheDocument()
  })
})
```

---

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/layout/TabBar.test.tsx src/components/layout/TopBar.test.tsx`
Expected: FAIL with "Cannot find module './TabBar'" and "Cannot find module './TopBar'"

---

- [ ] **Step 3: Create `frontend/src/components/layout/TabBar.tsx`**

```typescript
// frontend/src/components/layout/TabBar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle, BarChart2, Image, User } from 'lucide-react'

const TABS = [
  { href: '/chat', label: '对话', Icon: MessageCircle },
  { href: '/dashboard', label: '数据', Icon: BarChart2 },
  { href: '/album', label: '相册', Icon: Image },
  { href: '/profile', label: '我的', Icon: User },
]

export default function TabBar() {
  const pathname = usePathname()

  // DESIGN.md: 对话页显示输入栏，其他页显示 Tab — 互斥
  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
    return null
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-mobile"
      style={{
        backgroundColor: 'var(--color-pure-white)',
        borderTop: '1px solid var(--color-oat-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center" style={{ height: '49px' }}>
        {TABS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          const color = isActive
            ? 'var(--color-fawn-amber)'
            : 'var(--color-mid-gray)'

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 h-full"
              style={{ color }}
            >
              <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
              <span
                className="font-medium"
                style={{ fontSize: '10px', lineHeight: '1.2' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

---

- [ ] **Step 4: Create `frontend/src/components/layout/TopBar.tsx`**

```typescript
// frontend/src/components/layout/TopBar.tsx
'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, Clock } from 'lucide-react'

interface TopBarProps {
  title: string
  showBack?: boolean
  showHistory?: boolean
  onHistoryClick?: () => void
}

export default function TopBar({
  title,
  showBack = false,
  showHistory = false,
  onHistoryClick,
}: TopBarProps) {
  const router = useRouter()

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 mx-auto max-w-mobile flex items-center justify-between px-4"
      style={{
        height: '44px',
        backgroundColor: 'var(--color-pure-white)',
        borderBottom: '1px solid var(--color-oat-border)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* Left: back button or spacer */}
      <div className="flex items-center" style={{ minWidth: '44px' }}>
        {showBack && (
          <button
            onClick={() => router.back()}
            aria-label="返回"
            className="flex items-center justify-center -ml-1"
            style={{
              width: '44px',
              height: '44px',
              color: 'var(--color-fawn-amber)',
            }}
          >
            <ChevronLeft size={24} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Center: title */}
      <h1
        className="absolute left-1/2 -translate-x-1/2 text-base font-semibold"
        style={{ color: 'var(--color-soft-charcoal)' }}
      >
        {title}
      </h1>

      {/* Right: history button or spacer */}
      <div className="flex items-center justify-end" style={{ minWidth: '44px' }}>
        {showHistory && (
          <button
            onClick={onHistoryClick}
            aria-label="历史对话"
            className="flex items-center justify-center"
            style={{
              width: '44px',
              height: '44px',
              color: 'var(--color-dark-gray)',
            }}
          >
            <Clock size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </header>
  )
}
```

---

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/layout/TabBar.test.tsx src/components/layout/TopBar.test.tsx`
Expected: PASS — all tests passing.

---

- [ ] **Step 6: Create `frontend/src/app/(main)/layout.tsx`**

```typescript
// frontend/src/app/(main)/layout.tsx
'use client'

import { usePathname } from 'next/navigation'
import TabBar from '@/components/layout/TabBar'

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isChatPage = pathname === '/chat' || pathname.startsWith('/chat/')

  return (
    <div
      className="relative mx-auto max-w-mobile min-h-screen"
      style={{ backgroundColor: 'var(--color-warm-cream)' }}
    >
      <main
        className="overflow-y-auto"
        style={{
          paddingTop: isChatPage ? '0' : '44px',
          paddingBottom: isChatPage ? '0' : 'calc(49px + env(safe-area-inset-bottom))',
          minHeight: '100svh',
        }}
      >
        {children}
      </main>
      {!isChatPage && <TabBar />}
    </div>
  )
}
```

---

- [ ] **Step 7: Create `frontend/src/app/layout.tsx`**

```typescript
// frontend/src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'
import { AuthGuard } from '@/components/auth/AuthGuard'

export const metadata: Metadata = {
  title: 'Fawn — 家庭育儿助手',
  description: '私有化家庭育儿 Agent，陪伴宝宝成长每一步',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthGuard>{children}</AuthGuard>
      </body>
    </html>
  )
}
```

---

- [ ] **Step 8: Create `frontend/src/app/page.tsx`**

```typescript
// frontend/src/app/page.tsx
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/chat')
}
```

---

- [ ] **Step 9: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build completes with no errors.

---

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/layout/TabBar.tsx frontend/src/components/layout/TabBar.test.tsx frontend/src/components/layout/TopBar.tsx frontend/src/components/layout/TopBar.test.tsx frontend/src/app/\(main\)/layout.tsx frontend/src/app/layout.tsx frontend/src/app/page.tsx
git commit -m "feat(frontend): add TabBar, TopBar, main layout shell, and root redirect"
```
### Task 6: Base UI Components

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Avatar.tsx`
- Test: `frontend/src/components/ui/Button.test.tsx`
- Test: `frontend/src/components/ui/Card.test.tsx`
- Test: `frontend/src/components/ui/Avatar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/components/ui/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders primary variant with correct classes', () => {
    render(<Button variant="primary">Click me</Button>)
    const btn = screen.getByRole('button', { name: 'Click me' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveClass('bg-fawn-amber')
  })

  it('renders secondary variant with correct classes', () => {
    render(<Button variant="secondary">Cancel</Button>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn).toHaveClass('border-fawn-amber')
  })

  it('renders danger variant with correct classes', () => {
    render(<Button variant="danger">Delete</Button>)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn).toHaveClass('bg-safety-red')
  })

  it('renders text variant with transparent background', () => {
    render(<Button variant="text">Link</Button>)
    const btn = screen.getByRole('button', { name: 'Link' })
    expect(btn).toHaveClass('bg-transparent')
  })

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<Button variant="primary" onClick={handleClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn()
    render(<Button variant="primary" onClick={handleClick} disabled>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('renders disabled state with correct attribute', () => {
    render(<Button variant="primary" disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies custom className', () => {
    render(<Button variant="primary" className="extra-class">Btn</Button>)
    expect(screen.getByRole('button')).toHaveClass('extra-class')
  })

  it('renders as submit type when specified', () => {
    render(<Button variant="primary" type="submit">Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })
})
```

```typescript
// frontend/src/components/ui/Card.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card><p>Card content</p></Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies base card styles', () => {
    render(<Card><span>test</span></Card>)
    const card = screen.getByText('test').parentElement
    expect(card).toHaveClass('rounded-card')
    expect(card).toHaveClass('shadow-card')
    expect(card).toHaveClass('border-oat-border')
  })

  it('applies custom className', () => {
    render(<Card className="extra-class"><span>test</span></Card>)
    const card = screen.getByText('test').parentElement
    expect(card).toHaveClass('extra-class')
  })
})
```

```typescript
// frontend/src/components/ui/Avatar.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('renders first character of name as fallback', () => {
    render(<Avatar name="妈妈" />)
    expect(screen.getByText('妈')).toBeInTheDocument()
  })

  it('renders image when imageUrl is provided', () => {
    render(<Avatar name="妈妈" imageUrl="https://example.com/avatar.jpg" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
  })

  it('applies sm size classes', () => {
    render(<Avatar name="爸" size="sm" />)
    const container = screen.getByText('爸').parentElement
    expect(container).toHaveClass('w-9', 'h-9')
  })

  it('applies md size classes by default', () => {
    render(<Avatar name="爸" />)
    const container = screen.getByText('爸').parentElement
    expect(container).toHaveClass('w-12', 'h-12')
  })

  it('applies lg size classes', () => {
    render(<Avatar name="爸" size="lg" />)
    const container = screen.getByText('爸').parentElement
    expect(container).toHaveClass('w-16', 'h-16')
  })

  it('applies role color ring for mom role', () => {
    render(<Avatar name="妈妈" role="mom" />)
    const container = screen.getByText('妈').parentElement
    expect(container).toHaveStyle({ borderColor: '#D4956A' })
  })

  it('applies mid-gray ring for agent role', () => {
    render(<Avatar name="Fawn" role="agent" />)
    const container = screen.getByText('F').parentElement
    expect(container).toHaveStyle({ borderColor: '#8E8E93' })
  })

  it('applies custom className', () => {
    render(<Avatar name="Test" className="extra" />)
    const container = screen.getByText('T').parentElement
    expect(container).toHaveClass('extra')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ui/Button.test.tsx src/components/ui/Card.test.tsx src/components/ui/Avatar.test.tsx`
Expected: FAIL with "Cannot find module './Button'" (or similar module not found errors)

- [ ] **Step 3: Write implementations**

```typescript
// frontend/src/components/ui/Button.tsx
import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger' | 'text'
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}

const variantClasses: Record<ButtonProps['variant'], string> = {
  primary:
    'bg-fawn-amber text-white active:opacity-85 disabled:opacity-50',
  secondary:
    'bg-white text-fawn-amber border border-fawn-amber active:bg-amber-50 disabled:opacity-50',
  danger:
    'bg-safety-red text-white active:opacity-85 disabled:opacity-50',
  text:
    'bg-transparent text-fawn-amber active:opacity-75 disabled:opacity-50',
}

export function Button({
  variant,
  children,
  onClick,
  disabled = false,
  className,
  type = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-btn px-6 py-3 text-base font-medium transition-opacity',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}
```

```typescript
// frontend/src/components/ui/Card.tsx
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white border border-oat-border rounded-card p-4 shadow-card',
        className,
      )}
    >
      {children}
    </div>
  )
}
```

```typescript
// frontend/src/components/ui/Avatar.tsx
import { cn } from '@/lib/utils'

const ROLE_COLORS: Record<string, string> = {
  mom: '#D4956A',
  dad: '#5B9BD5',
  grandma: '#B07CC6',
  grandpa: '#6BAF8D',
  agent: '#8E8E93',
}

const DEFAULT_RING_COLOR = '#C7BEB5'

interface AvatarProps {
  name: string
  role?: string
  size?: 'sm' | 'md' | 'lg'
  imageUrl?: string
  className?: string
}

const sizeClasses = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-xl',
}

export function Avatar({
  name,
  role,
  size = 'md',
  imageUrl,
  className,
}: AvatarProps) {
  const ringColor = role ? (ROLE_COLORS[role] ?? DEFAULT_RING_COLOR) : DEFAULT_RING_COLOR
  const initial = name.charAt(0)

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full border-2 overflow-hidden flex-shrink-0',
        sizeClasses[size],
        className,
      )}
      style={{ borderColor: ringColor }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          className="font-medium text-soft-charcoal select-none"
          style={{ color: ringColor }}
        >
          {initial}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ui/Button.test.tsx src/components/ui/Card.test.tsx src/components/ui/Avatar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/Button.tsx frontend/src/components/ui/Card.tsx frontend/src/components/ui/Avatar.tsx frontend/src/components/ui/Button.test.tsx frontend/src/components/ui/Card.test.tsx frontend/src/components/ui/Avatar.test.tsx
git commit -m "feat(frontend): add base UI components Button, Card, Avatar"
```

---

### Task 7: Chat Message Components

**Files:**
- Create: `frontend/src/components/chat/MessageBubble.tsx`
- Create: `frontend/src/components/chat/SafetyAlert.tsx`
- Create: `frontend/src/components/chat/DataCard.tsx`
- Test: `frontend/src/components/chat/MessageBubble.test.tsx`
- Test: `frontend/src/components/chat/SafetyAlert.test.tsx`
- Test: `frontend/src/components/chat/DataCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/components/chat/MessageBubble.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageBubble } from './MessageBubble'
import type { Message } from '@/lib/types'

const agentMessage: Message = {
  id: '1',
  conversationId: 'conv1',
  role: 'agent',
  content: 'Hello! How can I help you?',
  contentType: 'text',
  createdAt: '2024-01-15T10:00:00Z',
}

const userMessage: Message = {
  id: '2',
  conversationId: 'conv1',
  role: 'user',
  content: 'My baby has a fever.',
  contentType: 'text',
  createdAt: '2024-01-15T10:01:00Z',
}

const safetyMessage: Message = {
  id: '3',
  conversationId: 'conv1',
  role: 'agent',
  content: '发现安全隐患',
  contentType: 'safety_alert',
  createdAt: '2024-01-15T10:02:00Z',
}

const dataCardMessage: Message = {
  id: '4',
  conversationId: 'conv1',
  role: 'agent',
  content: '',
  contentType: 'data_card',
  createdAt: '2024-01-15T10:03:00Z',
  metadata: {
    dataCard: {
      type: 'growth',
      title: '今日体重',
      value: '6.2',
      unit: 'kg',
      subtitle: '正常范围',
      status: 'normal',
    },
  },
}

describe('MessageBubble', () => {
  it('renders agent message with warm-gray background', () => {
    const { container } = render(<MessageBubble message={agentMessage} />)
    const bubble = container.querySelector('[data-testid="agent-bubble"]')
    expect(bubble).toBeInTheDocument()
    expect(bubble).toHaveClass('bg-warm-gray')
  })

  it('renders agent message text', () => {
    render(<MessageBubble message={agentMessage} />)
    expect(screen.getByText('Hello! How can I help you?')).toBeInTheDocument()
  })

  it('renders user message with fawn-amber background', () => {
    const { container } = render(<MessageBubble message={userMessage} />)
    const bubble = container.querySelector('[data-testid="user-bubble"]')
    expect(bubble).toBeInTheDocument()
    expect(bubble).toHaveClass('bg-fawn-amber')
  })

  it('renders user message text', () => {
    render(<MessageBubble message={userMessage} />)
    expect(screen.getByText('My baby has a fever.')).toBeInTheDocument()
  })

  it('renders SafetyAlert for safety_alert contentType', () => {
    render(<MessageBubble message={safetyMessage} />)
    expect(screen.getByTestId('safety-alert')).toBeInTheDocument()
  })

  it('renders DataCard for data_card contentType', () => {
    render(<MessageBubble message={dataCardMessage} />)
    expect(screen.getByTestId('data-card')).toBeInTheDocument()
  })

  it('renders agent avatar for agent messages', () => {
    render(<MessageBubble message={agentMessage} />)
    expect(screen.getByTestId('agent-avatar')).toBeInTheDocument()
  })

  it('aligns agent message to the left', () => {
    const { container } = render(<MessageBubble message={agentMessage} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('justify-start')
  })

  it('aligns user message to the right', () => {
    const { container } = render(<MessageBubble message={userMessage} />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('justify-end')
  })
})
```

```typescript
// frontend/src/components/chat/SafetyAlert.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SafetyAlert } from './SafetyAlert'

describe('SafetyAlert', () => {
  it('renders the message text', () => {
    render(<SafetyAlert message="宝宝发烧超过38.5度" />)
    expect(screen.getByText('宝宝发烧超过38.5度')).toBeInTheDocument()
  })

  it('renders the doctor recommendation text', () => {
    render(<SafetyAlert message="Any message" />)
    expect(screen.getByText('建议尽快咨询医生/就医')).toBeInTheDocument()
  })

  it('has safety-red-light background', () => {
    render(<SafetyAlert message="test" />)
    const alert = screen.getByTestId('safety-alert')
    expect(alert).toHaveClass('bg-safety-red-light')
  })

  it('has left border with safety-red color', () => {
    render(<SafetyAlert message="test" />)
    const alert = screen.getByTestId('safety-alert')
    expect(alert).toHaveClass('border-l-4')
    expect(alert).toHaveClass('border-safety-red')
  })
})
```

```typescript
// frontend/src/components/chat/DataCard.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DataCard } from './DataCard'
import type { DataCardContent } from '@/lib/types'

const normalData: DataCardContent = {
  type: 'growth',
  title: '今日体重',
  value: '6.2',
  unit: 'kg',
  subtitle: '正常范围',
  status: 'normal',
}

const dangerData: DataCardContent = {
  type: 'feeding',
  title: '喂奶量',
  value: '120',
  unit: 'ml',
  subtitle: '偏少，请注意',
  status: 'danger',
}

describe('DataCard', () => {
  it('renders the title', () => {
    render(<DataCard data={normalData} />)
    expect(screen.getByText('今日体重')).toBeInTheDocument()
  })

  it('renders the value', () => {
    render(<DataCard data={normalData} />)
    expect(screen.getByText('6.2')).toBeInTheDocument()
  })

  it('renders the unit', () => {
    render(<DataCard data={normalData} />)
    expect(screen.getByText('kg')).toBeInTheDocument()
  })

  it('renders subtitle', () => {
    render(<DataCard data={normalData} />)
    expect(screen.getByText('正常范围')).toBeInTheDocument()
  })

  it('applies green color for normal status subtitle', () => {
    render(<DataCard data={normalData} />)
    const subtitle = screen.getByText('正常范围')
    expect(subtitle).toHaveClass('text-sage-green')
  })

  it('applies red color for danger status subtitle', () => {
    render(<DataCard data={dangerData} />)
    const subtitle = screen.getByText('偏少，请注意')
    expect(subtitle).toHaveClass('text-safety-red')
  })

  it('has data-testid for testing', () => {
    render(<DataCard data={normalData} />)
    expect(screen.getByTestId('data-card')).toBeInTheDocument()
  })

  it('renders value with font-mono class', () => {
    render(<DataCard data={normalData} />)
    const value = screen.getByText('6.2')
    expect(value).toHaveClass('font-mono')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/chat/MessageBubble.test.tsx src/components/chat/SafetyAlert.test.tsx src/components/chat/DataCard.test.tsx`
Expected: FAIL with "Cannot find module './MessageBubble'" (or similar)

- [ ] **Step 3: Write implementations**

```typescript
// frontend/src/components/chat/SafetyAlert.tsx
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SafetyAlertProps {
  message: string
  className?: string
}

export function SafetyAlert({ message, className }: SafetyAlertProps) {
  return (
    <div
      data-testid="safety-alert"
      className={cn(
        'bg-safety-red-light border-l-4 border-safety-red rounded-[12px] p-3 max-w-[85vw]',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={18}
          className="text-safety-red flex-shrink-0 mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <p className="text-soft-charcoal text-sm">{message}</p>
          <p className="text-safety-red text-sm font-bold">
            建议尽快咨询医生/就医
          </p>
        </div>
      </div>
    </div>
  )
}
```

```typescript
// frontend/src/components/chat/DataCard.tsx
import { cn } from '@/lib/utils'
import type { DataCardContent } from '@/lib/types'

interface DataCardProps {
  data: DataCardContent
  className?: string
}

const statusColorClass: Record<string, string> = {
  normal: 'text-sage-green',
  warning: 'text-warning-amber',
  danger: 'text-safety-red',
}

export function DataCard({ data, className }: DataCardProps) {
  const subtitleColor = data.status ? statusColorClass[data.status] : 'text-mid-gray'

  return (
    <div
      data-testid="data-card"
      className={cn(
        'bg-white border border-oat-border rounded-[12px] shadow-card p-4 max-w-[85vw]',
        className,
      )}
    >
      <p className="text-[14px] text-mid-gray mb-2">{data.title}</p>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-[28px] font-mono text-soft-charcoal leading-none">
          {data.value}
        </span>
        <span className="text-[14px] text-mid-gray">{data.unit}</span>
      </div>
      {data.subtitle && (
        <p className={cn('text-[14px]', subtitleColor)}>{data.subtitle}</p>
      )}
    </div>
  )
}
```

```typescript
// frontend/src/components/chat/MessageBubble.tsx
import { cn } from '@/lib/utils'
import type { Message } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { SafetyAlert } from './SafetyAlert'
import { DataCard } from './DataCard'

interface MessageBubbleProps {
  message: Message
  userName?: string
}

export function MessageBubble({ message, userName }: MessageBubbleProps) {
  const isAgent = message.role === 'agent'

  if (message.contentType === 'safety_alert') {
    return (
      <div className={cn('flex w-full', isAgent ? 'justify-start' : 'justify-end', 'px-4 py-1')}>
        {isAgent && (
          <div data-testid="agent-avatar" className="mr-2 mt-auto">
            <Avatar name="F" role="agent" size="sm" />
          </div>
        )}
        <SafetyAlert message={message.content} />
      </div>
    )
  }

  if (message.contentType === 'data_card' && message.metadata?.dataCard) {
    return (
      <div className={cn('flex w-full', isAgent ? 'justify-start' : 'justify-end', 'px-4 py-1')}>
        {isAgent && (
          <div data-testid="agent-avatar" className="mr-2 mt-auto">
            <Avatar name="F" role="agent" size="sm" />
          </div>
        )}
        <DataCard data={message.metadata.dataCard} />
      </div>
    )
  }

  if (message.contentType === 'image') {
    const imageUrl = message.metadata?.imageUrl ?? message.content
    return (
      <div className={cn('flex w-full', isAgent ? 'justify-start' : 'justify-end', 'px-4 py-1')}>
        {isAgent && (
          <div data-testid="agent-avatar" className="mr-2 mt-auto">
            <Avatar name="F" role="agent" size="sm" />
          </div>
        )}
        <img
          src={imageUrl}
          alt="attachment"
          className="max-w-[75vw] rounded-[12px] object-cover"
          data-testid="image-message"
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex w-full items-end gap-2 px-4 py-1',
        isAgent ? 'justify-start' : 'justify-end',
      )}
    >
      {isAgent && (
        <div data-testid="agent-avatar" className="flex-shrink-0">
          <Avatar name="F" role="agent" size="sm" />
        </div>
      )}
      <div
        data-testid={isAgent ? 'agent-bubble' : 'user-bubble'}
        className={cn(
          'px-4 py-3 max-w-[75vw] text-base leading-relaxed',
          isAgent
            ? 'bg-warm-gray text-soft-charcoal rounded-[20px] rounded-tl-[4px]'
            : 'bg-fawn-amber text-white rounded-[20px] rounded-tr-[4px]',
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/chat/MessageBubble.test.tsx src/components/chat/SafetyAlert.test.tsx src/components/chat/DataCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/MessageBubble.tsx frontend/src/components/chat/SafetyAlert.tsx frontend/src/components/chat/DataCard.tsx frontend/src/components/chat/MessageBubble.test.tsx frontend/src/components/chat/SafetyAlert.test.tsx frontend/src/components/chat/DataCard.test.tsx
git commit -m "feat(frontend): add chat message components MessageBubble, SafetyAlert, DataCard"
```

---

### Task 8: Chat Input & Interaction Components

**Files:**
- Create: `frontend/src/components/chat/ChatInput.tsx`
- Create: `frontend/src/components/chat/TimeSeparator.tsx`
- Create: `frontend/src/components/chat/TypingIndicator.tsx`
- Create: `frontend/src/components/chat/QuickActionChips.tsx`
- Test: `frontend/src/components/chat/ChatInput.test.tsx`
- Test: `frontend/src/components/chat/TimeSeparator.test.tsx`
- Test: `frontend/src/components/chat/TypingIndicator.test.tsx`
- Test: `frontend/src/components/chat/QuickActionChips.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/components/chat/ChatInput.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatInput } from './ChatInput'

describe('ChatInput', () => {
  it('renders the input field', () => {
    render(<ChatInput onSend={vi.fn()} />)
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('renders the send button', () => {
    render(<ChatInput onSend={vi.fn()} />)
    expect(screen.getByTestId('send-button')).toBeInTheDocument()
  })

  it('renders the attachment button', () => {
    render(<ChatInput onSend={vi.fn()} onAttachImage={vi.fn()} />)
    expect(screen.getByTestId('attach-button')).toBeInTheDocument()
  })

  it('calls onSend with input value when send button clicked', () => {
    const handleSend = vi.fn()
    render(<ChatInput onSend={handleSend} />)
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: 'Hello baby' } })
    fireEvent.click(screen.getByTestId('send-button'))
    expect(handleSend).toHaveBeenCalledWith('Hello baby')
  })

  it('clears input after sending', () => {
    render(<ChatInput onSend={vi.fn()} />)
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(screen.getByTestId('send-button'))
    expect(input).toHaveValue('')
  })

  it('does not send empty message', () => {
    const handleSend = vi.fn()
    render(<ChatInput onSend={handleSend} />)
    fireEvent.click(screen.getByTestId('send-button'))
    expect(handleSend).not.toHaveBeenCalled()
  })

  it('does not send whitespace-only message', () => {
    const handleSend = vi.fn()
    render(<ChatInput onSend={handleSend} />)
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('send-button'))
    expect(handleSend).not.toHaveBeenCalled()
  })

  it('sends message on Enter key', () => {
    const handleSend = vi.fn()
    render(<ChatInput onSend={handleSend} />)
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: 'Enter message' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    expect(handleSend).toHaveBeenCalledWith('Enter message')
  })

  it('does not send on Shift+Enter', () => {
    const handleSend = vi.fn()
    render(<ChatInput onSend={handleSend} />)
    const input = screen.getByPlaceholderText('输入消息...')
    fireEvent.change(input, { target: { value: 'Multiline' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(handleSend).not.toHaveBeenCalled()
  })

  it('disables input and send button when disabled prop is true', () => {
    render(<ChatInput onSend={vi.fn()} disabled />)
    expect(screen.getByPlaceholderText('输入消息...')).toBeDisabled()
    expect(screen.getByTestId('send-button')).toBeDisabled()
  })

  it('calls onAttachImage when a file is selected via attach button', () => {
    const handleAttach = vi.fn()
    render(<ChatInput onSend={vi.fn()} onAttachImage={handleAttach} />)
    fireEvent.click(screen.getByTestId('attach-button'))
    const fileInput = screen.getByTestId('file-input') as HTMLInputElement
    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    expect(handleAttach).toHaveBeenCalledWith(file)
  })
})
```

```typescript
// frontend/src/components/chat/TimeSeparator.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TimeSeparator } from './TimeSeparator'

describe('TimeSeparator', () => {
  it('renders the time text', () => {
    render(<TimeSeparator time="上午 10:30" />)
    expect(screen.getByText('上午 10:30')).toBeInTheDocument()
  })

  it('applies mid-gray text color', () => {
    render(<TimeSeparator time="下午 3:00" />)
    const el = screen.getByText('下午 3:00')
    expect(el).toHaveClass('text-mid-gray')
  })

  it('applies centered alignment', () => {
    const { container } = render(<TimeSeparator time="下午 3:00" />)
    expect(container.firstChild).toHaveClass('text-center')
  })
})
```

```typescript
// frontend/src/components/chat/TypingIndicator.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TypingIndicator } from './TypingIndicator'

describe('TypingIndicator', () => {
  it('renders three dots', () => {
    render(<TypingIndicator />)
    const dots = screen.getAllByTestId('typing-dot')
    expect(dots).toHaveLength(3)
  })

  it('renders the agent avatar', () => {
    render(<TypingIndicator />)
    expect(screen.getByTestId('typing-agent-avatar')).toBeInTheDocument()
  })
})
```

```typescript
// frontend/src/components/chat/QuickActionChips.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QuickActionChips } from './QuickActionChips'

const actions = [
  { label: '记录喂奶', onClick: vi.fn() },
  { label: '今天体重', onClick: vi.fn() },
  { label: '睡眠情况', onClick: vi.fn() },
]

describe('QuickActionChips', () => {
  it('renders all action chips', () => {
    render(<QuickActionChips actions={actions} />)
    expect(screen.getByText('记录喂奶')).toBeInTheDocument()
    expect(screen.getByText('今天体重')).toBeInTheDocument()
    expect(screen.getByText('睡眠情况')).toBeInTheDocument()
  })

  it('calls onClick when chip is clicked', () => {
    const handleClick = vi.fn()
    render(
      <QuickActionChips
        actions={[{ label: '记录喂奶', onClick: handleClick }]}
      />,
    )
    fireEvent.click(screen.getByText('记录喂奶'))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('renders a scrollable container', () => {
    const { container } = render(<QuickActionChips actions={actions} />)
    const scrollContainer = container.firstChild as HTMLElement
    expect(scrollContainer).toHaveClass('overflow-x-auto')
  })

  it('applies border-oat-border to chips', () => {
    render(<QuickActionChips actions={[{ label: 'Test', onClick: vi.fn() }]} />)
    const chip = screen.getByText('Test').closest('button')
    expect(chip).toHaveClass('border-oat-border')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/chat/ChatInput.test.tsx src/components/chat/TimeSeparator.test.tsx src/components/chat/TypingIndicator.test.tsx src/components/chat/QuickActionChips.test.tsx`
Expected: FAIL with "Cannot find module" errors

- [ ] **Step 3: Write implementations**

```typescript
// frontend/src/components/chat/ChatInput.tsx
'use client'

import { useState, useRef, type KeyboardEvent, type ChangeEvent } from 'react'
import { PlusCircle, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (content: string) => void
  onAttachImage?: (file: File) => void
  disabled?: boolean
}

export function ChatInput({ onSend, onAttachImage, disabled = false }: ChatInputProps) {
  const [value, setValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    if (!value.trim() || disabled) return
    onSend(value.trim())
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onAttachImage) {
      onAttachImage(file)
    }
    e.target.value = ''
  }

  return (
    <div
      className="bg-white border-t border-oat-border px-3 py-2"
      style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-end gap-2">
        {onAttachImage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              data-testid="file-input"
            />
            <button
              data-testid="attach-button"
              type="button"
              onClick={handleAttachClick}
              disabled={disabled}
              className="flex-shrink-0 text-mid-gray active:text-fawn-amber disabled:opacity-40 mb-1"
            >
              <PlusCircle size={24} />
            </button>
          </>
        )}
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={disabled}
          rows={1}
          className={cn(
            'flex-1 bg-warm-gray rounded-[20px] px-4 py-2 text-base text-soft-charcoal placeholder:text-mid-gray',
            'resize-none outline-none max-h-32 overflow-y-auto',
            'disabled:opacity-60',
          )}
        />
        <button
          data-testid="send-button"
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className={cn(
            'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mb-1',
            'transition-colors',
            value.trim() && !disabled
              ? 'bg-fawn-amber text-white active:opacity-85'
              : 'bg-oat-border text-mid-gray',
            'disabled:cursor-not-allowed',
          )}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
```

```typescript
// frontend/src/components/chat/TimeSeparator.tsx
interface TimeSeparatorProps {
  time: string
}

export function TimeSeparator({ time }: TimeSeparatorProps) {
  return (
    <div className="text-center py-2 flex items-center justify-center">
      <span
        className="text-mid-gray text-[12px] px-2 py-0.5 rounded-[10px]"
        style={{ backgroundColor: 'rgba(142,142,147,0.12)' }}
      >
        {time}
      </span>
    </div>
  )
}
```

```typescript
// frontend/src/components/chat/TypingIndicator.tsx
import { Avatar } from '@/components/ui/Avatar'

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-4 py-2">
      <div data-testid="typing-agent-avatar" className="flex-shrink-0">
        <Avatar name="F" role="agent" size="sm" />
      </div>
      <div className="bg-warm-gray rounded-[20px] rounded-tl-[4px] px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            data-testid="typing-dot"
            className="w-1.5 h-1.5 rounded-full bg-mid-gray"
            style={{
              animation: `typingDot 1.2s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.25; }
          30% { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
```

```typescript
// frontend/src/components/chat/QuickActionChips.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface QuickAction {
  label: string
  onClick: () => void
}

interface QuickActionChipsProps {
  actions: QuickAction[]
}

export function QuickActionChips({ actions }: QuickActionChipsProps) {
  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  const handleClick = (action: QuickAction) => {
    setActiveLabel(action.label)
    action.onClick()
    setTimeout(() => setActiveLabel(null), 300)
  }

  return (
    <div className="overflow-x-auto scrollbar-none">
      <div className="flex gap-2 px-3 py-2 w-max">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleClick(action)}
            className={cn(
              'flex-shrink-0 border rounded-[16px] px-[14px] py-[6px] text-[14px] transition-colors',
              'border-oat-border text-soft-charcoal',
              activeLabel === action.label
                ? 'bg-amber-50 border-fawn-amber'
                : 'bg-white',
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/chat/ChatInput.test.tsx src/components/chat/TimeSeparator.test.tsx src/components/chat/TypingIndicator.test.tsx src/components/chat/QuickActionChips.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ChatInput.tsx frontend/src/components/chat/TimeSeparator.tsx frontend/src/components/chat/TypingIndicator.tsx frontend/src/components/chat/QuickActionChips.tsx frontend/src/components/chat/ChatInput.test.tsx frontend/src/components/chat/TimeSeparator.test.tsx frontend/src/components/chat/TypingIndicator.test.tsx frontend/src/components/chat/QuickActionChips.test.tsx
git commit -m "feat(frontend): add chat input and interaction components"
```

---

### Task 9: Chat Page Assembly

**Files:**
- Create: `frontend/src/lib/chat-store.ts`
- Create: `frontend/src/components/chat/MessageList.tsx`
- Create: `frontend/src/app/(main)/chat/page.tsx`
- Test: `frontend/src/lib/chat-store.test.ts`
- Test: `frontend/src/components/chat/MessageList.test.tsx`
- Test: `frontend/src/app/(main)/chat/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/chat-store.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChatStore } from './chat-store'

vi.mock('@/lib/api', () => ({
  sendMessage: vi.fn().mockResolvedValue({
    id: 'resp-1',
    conversationId: 'conv1',
    role: 'agent',
    content: 'Agent response',
    contentType: 'text',
    createdAt: new Date().toISOString(),
  }),
  getMessages: vi.fn().mockResolvedValue([
    {
      id: 'msg-1',
      conversationId: 'conv1',
      role: 'user',
      content: 'Hello',
      contentType: 'text',
      createdAt: new Date().toISOString(),
    },
  ]),
}))

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isTyping: false,
      currentConversationId: null,
    })
  })

  it('initializes with empty messages', () => {
    const { result } = renderHook(() => useChatStore())
    expect(result.current.messages).toHaveLength(0)
  })

  it('initializes with isTyping false', () => {
    const { result } = renderHook(() => useChatStore())
    expect(result.current.isTyping).toBe(false)
  })

  it('setTyping updates isTyping state', () => {
    const { result } = renderHook(() => useChatStore())
    act(() => {
      result.current.setTyping(true)
    })
    expect(result.current.isTyping).toBe(true)
  })

  it('loadMessages fetches and sets messages', async () => {
    const { result } = renderHook(() => useChatStore())
    await act(async () => {
      await result.current.loadMessages('conv1')
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toBe('Hello')
    expect(result.current.currentConversationId).toBe('conv1')
  })

  it('sendMessage adds user message then agent response', async () => {
    const { result } = renderHook(() => useChatStore())
    act(() => {
      useChatStore.setState({ currentConversationId: 'conv1' })
    })
    await act(async () => {
      await result.current.sendMessage('Test message')
    })
    const messages = result.current.messages
    expect(messages.some((m) => m.role === 'user' && m.content === 'Test message')).toBe(true)
    expect(messages.some((m) => m.role === 'agent' && m.content === 'Agent response')).toBe(true)
  })

  it('sendMessage sets typing true then false', async () => {
    const typingStates: boolean[] = []
    const unsub = useChatStore.subscribe((s) => typingStates.push(s.isTyping))
    const { result } = renderHook(() => useChatStore())
    act(() => {
      useChatStore.setState({ currentConversationId: 'conv1' })
    })
    await act(async () => {
      await result.current.sendMessage('Hi')
    })
    unsub()
    expect(typingStates).toContain(true)
    expect(result.current.isTyping).toBe(false)
  })

  it('addMessage appends a message to the list', () => {
    const { result } = renderHook(() => useChatStore())
    const imageMessage = {
      id: 'img-1',
      conversationId: 'conv1',
      role: 'user' as const,
      content: 'blob:http://localhost/fake-image',
      contentType: 'image' as const,
      createdAt: new Date().toISOString(),
    }
    act(() => {
      result.current.addMessage(imageMessage)
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].contentType).toBe('image')
    expect(result.current.messages[0].id).toBe('img-1')
  })
})
```

```typescript
// frontend/src/components/chat/MessageList.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageList } from './MessageList'
import type { Message } from '@/lib/types'
import { useChatStore } from '@/lib/chat-store'

vi.mock('@/lib/chat-store', () => ({
  useChatStore: vi.fn(() => ({ isTyping: false })),
}))

const messages: Message[] = [
  {
    id: '1',
    conversationId: 'conv1',
    role: 'agent',
    content: 'Hello there',
    contentType: 'text',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2',
    conversationId: 'conv1',
    role: 'user',
    content: 'Hi agent',
    contentType: 'text',
    createdAt: '2024-01-15T10:01:00Z',
  },
]

const separatedMessages: Message[] = [
  {
    id: '1',
    conversationId: 'conv1',
    role: 'agent',
    content: 'Early message',
    contentType: 'text',
    createdAt: '2024-01-15T09:00:00Z',
  },
  {
    id: '2',
    conversationId: 'conv1',
    role: 'user',
    content: 'Late message',
    contentType: 'text',
    createdAt: '2024-01-15T10:00:00Z',
  },
]

describe('MessageList', () => {
  it('renders all messages', () => {
    render(<MessageList messages={messages} />)
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('Hi agent')).toBeInTheDocument()
  })

  it('shows TypingIndicator when isTyping is true', () => {
    vi.mocked(useChatStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ isTyping: true })
    render(<MessageList messages={messages} />)
    expect(screen.getAllByTestId('typing-dot')).toHaveLength(3)
  })

  it('renders TimeSeparator for messages more than 5 min apart', () => {
    const { container } = render(<MessageList messages={separatedMessages} />)
    expect(container.querySelectorAll('[class*="text-mid-gray"]').length).toBeGreaterThan(0)
  })

  it('does not show TypingIndicator when isTyping is false', () => {
    render(<MessageList messages={messages} />)
    expect(screen.queryAllByTestId('typing-dot')).toHaveLength(0)
  })
})
```

```typescript
// frontend/src/app/(main)/chat/page.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({
    get: () => null,
  }),
}))

vi.mock('@/lib/chat-store', () => ({
  useChatStore: vi.fn(() => ({
    messages: [
      {
        id: '1',
        conversationId: 'conv1',
        role: 'agent',
        content: 'Welcome to Fawn!',
        contentType: 'text',
        createdAt: new Date().toISOString(),
      },
    ],
    isTyping: false,
    currentConversationId: 'conv1',
    loadMessages: vi.fn(),
    sendMessage: vi.fn(),
    addMessage: vi.fn(),
    setTyping: vi.fn(),
  })),
}))

import ChatPage from './page'

describe('ChatPage', () => {
  it('renders the Fawn title in the top bar', () => {
    render(<ChatPage />)
    expect(screen.getByText('Fawn')).toBeInTheDocument()
  })

  it('renders the chat input', () => {
    render(<ChatPage />)
    expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument()
  })

  it('renders quick action chips', () => {
    render(<ChatPage />)
    expect(screen.getByText('记录喂奶')).toBeInTheDocument()
  })

  it('renders message in the list', () => {
    render(<ChatPage />)
    expect(screen.getByText('Welcome to Fawn!')).toBeInTheDocument()
  })

  it('renders history navigation button', () => {
    render(<ChatPage />)
    expect(screen.getByTestId('history-button')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/chat-store.test.ts src/components/chat/MessageList.test.tsx src/app/\(main\)/chat/page.test.tsx`
Expected: FAIL with module not found errors

- [ ] **Step 3: Write implementations**

```typescript
// frontend/src/lib/chat-store.ts
import { create } from 'zustand'
import { getMessages, sendMessage as apiSendMessage } from '@/lib/api'
import type { Message } from '@/lib/types'

interface ChatState {
  messages: Message[]
  isTyping: boolean
  currentConversationId: string | null
  loadMessages: (conversationId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  addMessage: (message: Message) => void
  setTyping: (typing: boolean) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isTyping: false,
  currentConversationId: null,

  setTyping: (typing) => set({ isTyping: typing }),

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),

  loadMessages: async (conversationId) => {
    const messages = await getMessages(conversationId)
    set({ messages, currentConversationId: conversationId })
  },

  sendMessage: async (content) => {
    const { currentConversationId } = get()
    const convId = currentConversationId ?? 'default'
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      conversationId: convId,
      role: 'user',
      content,
      contentType: 'text',
      createdAt: new Date().toISOString(),
    }
    set((state) => ({ messages: [...state.messages, userMessage], isTyping: true }))
    try {
      const agentResponse = await apiSendMessage(convId, content)
      set((state) => ({
        messages: [...state.messages, agentResponse],
        isTyping: false,
      }))
    } catch {
      set({ isTyping: false })
    }
  },
}))
```

```typescript
// frontend/src/components/chat/MessageList.tsx
'use client'

import { useEffect, useRef } from 'react'
import type { Message } from '@/lib/types'
import { useChatStore } from '@/lib/chat-store'
import { MessageBubble } from './MessageBubble'
import { TimeSeparator } from './TimeSeparator'
import { TypingIndicator } from './TypingIndicator'

interface MessageListProps {
  messages: Message[]
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? '下午' : '上午'
  const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours
  return `${period} ${displayHour}:${minutes}`
}

function needsSeparator(current: Message, previous: Message): boolean {
  const diff =
    new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime()
  return diff > 5 * 60 * 1000
}

export function MessageList({ messages }: MessageListProps) {
  const isTyping = useChatStore((s) => s.isTyping)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {messages.map((message, index) => {
        const prev = messages[index - 1]
        const showSeparator = prev ? needsSeparator(message, prev) : index === 0
        return (
          <div key={message.id}>
            {showSeparator && (
              <TimeSeparator time={formatTime(message.createdAt)} />
            )}
            <MessageBubble message={message} />
          </div>
        )
      })}
      {isTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  )
}
```

```typescript
// frontend/src/app/(main)/chat/page.tsx
'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { History } from 'lucide-react'
import { useChatStore } from '@/lib/chat-store'
import { MessageList } from '@/components/chat/MessageList'
import { ChatInput } from '@/components/chat/ChatInput'
import { QuickActionChips } from '@/components/chat/QuickActionChips'

const DEFAULT_CONVERSATION_ID = 'conv-1'

const QUICK_ACTIONS = [
  { label: '记录喂奶', prompt: '帮我记录一次喂奶' },
  { label: '今天体重', prompt: '查询宝宝今天的体重' },
  { label: '睡眠情况', prompt: '宝宝今天的睡眠情况如何？' },
  { label: '查看生长曲线', prompt: '展示宝宝的生长曲线' },
]

export default function ChatPage() {
  const router = useRouter()
  const { messages, loadMessages, sendMessage, addMessage } = useChatStore()

  const searchParams = useSearchParams()
  const conversationId = searchParams.get('conversationId') ?? DEFAULT_CONVERSATION_ID

  useEffect(() => {
    loadMessages(conversationId)
  }, [conversationId, loadMessages])

  const handleSend = (content: string) => {
    sendMessage(content)
  }

  const quickActions = QUICK_ACTIONS.map((a) => ({
    label: a.label,
    onClick: () => sendMessage(a.prompt),
  }))

  return (
    <div className="flex flex-col h-screen bg-warm-cream">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-oat-border flex-shrink-0">
        <div className="w-10" />
        <h1 className="text-[17px] font-semibold text-soft-charcoal">Fawn</h1>
        <button
          data-testid="history-button"
          type="button"
          onClick={() => router.push('/history')}
          className="w-10 h-10 flex items-center justify-center text-mid-gray active:text-fawn-amber"
        >
          <History size={22} />
        </button>
      </header>

      {/* Message List */}
      <MessageList messages={messages} />

      {/* Quick Actions + Input */}
      <div className="flex-shrink-0 bg-white border-t border-oat-border">
        <QuickActionChips actions={quickActions} />
        <ChatInput
          onSend={handleSend}
          onAttachImage={(file) => {
            const imageUrl = URL.createObjectURL(file)
            addMessage({
              id: `img-${Date.now()}`,
              conversationId,
              role: 'user',
              content: imageUrl,
              contentType: 'image',
              createdAt: new Date().toISOString(),
            })
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/chat-store.test.ts src/components/chat/MessageList.test.tsx src/app/\(main\)/chat/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chat-store.ts frontend/src/components/chat/MessageList.tsx frontend/src/app/\(main\)/chat/page.tsx frontend/src/lib/chat-store.test.ts frontend/src/components/chat/MessageList.test.tsx frontend/src/app/\(main\)/chat/page.test.tsx
git commit -m "feat(frontend): add chat store, MessageList, and chat page assembly"
```

---

### Task 10: Chat History Page

**Files:**
- Create: `frontend/src/app/(main)/history/page.tsx`
- Test: `frontend/src/app/(main)/history/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/app/(main)/history/page.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

import HistoryPage from './page'

describe('HistoryPage', () => {
  it('renders the 历史对话 title', () => {
    render(<HistoryPage />)
    expect(screen.getByText('历史对话')).toBeInTheDocument()
  })

  it('renders back button', () => {
    render(<HistoryPage />)
    expect(screen.getByTestId('back-button')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<HistoryPage />)
    expect(screen.getByPlaceholderText('搜索对话记录...')).toBeInTheDocument()
  })

  it('renders mock conversations', () => {
    render(<HistoryPage />)
    const items = screen.getAllByTestId('conversation-item')
    expect(items.length).toBeGreaterThan(0)
  })

  it('shows message count for each conversation', () => {
    render(<HistoryPage />)
    const counts = screen.getAllByTestId('message-count')
    expect(counts.length).toBeGreaterThan(0)
  })

  it('filters conversations by search keyword', () => {
    render(<HistoryPage />)
    const initialItems = screen.getAllByTestId('conversation-item')
    const searchInput = screen.getByPlaceholderText('搜索对话记录...')
    fireEvent.change(searchInput, { target: { value: 'zzznomatch9999' } })
    const filteredItems = screen.queryAllByTestId('conversation-item')
    expect(filteredItems.length).toBeLessThan(initialItems.length)
  })

  it('shows empty state when no search results', () => {
    render(<HistoryPage />)
    const searchInput = screen.getByPlaceholderText('搜索对话记录...')
    fireEvent.change(searchInput, { target: { value: 'zzznomatch9999' } })
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('navigates to conversation when item is clicked', () => {
    const push = vi.fn()
    vi.mocked(await import('next/navigation')).useRouter = () => ({
      push,
      back: vi.fn(),
    })
    render(<HistoryPage />)
    const firstItem = screen.getAllByTestId('conversation-item')[0]
    fireEvent.click(firstItem)
    expect(push).toHaveBeenCalled()
  })

  it('groups conversations by date', () => {
    render(<HistoryPage />)
    const dateHeaders = screen.getAllByTestId('date-group-header')
    expect(dateHeaders.length).toBeGreaterThan(0)
  })

  it('clears search when input is cleared', () => {
    render(<HistoryPage />)
    const searchInput = screen.getByPlaceholderText('搜索对话记录...')
    fireEvent.change(searchInput, { target: { value: '喂奶' } })
    fireEvent.change(searchInput, { target: { value: '' } })
    const items = screen.getAllByTestId('conversation-item')
    expect(items.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app/\(main\)/history/page.test.tsx`
Expected: FAIL with "Cannot find module './page'" (or similar)

- [ ] **Step 3: Write implementation**

```typescript
// frontend/src/app/(main)/history/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Search, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/types'

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    userId: 'user-1',
    startedAt: '2024-01-15T08:30:00Z',
    endedAt: '2024-01-15T09:00:00Z',
    summary: '询问了宝宝喂奶频率和母乳量，以及夜间哺乳安排建议',
    messageCount: 12,
  },
  {
    id: 'conv-2',
    userId: 'user-1',
    startedAt: '2024-01-15T14:00:00Z',
    endedAt: '2024-01-15T14:20:00Z',
    summary: '记录了午睡时间，讨论了宝宝睡眠规律和建立作息表',
    messageCount: 8,
  },
  {
    id: 'conv-3',
    userId: 'user-1',
    startedAt: '2024-01-14T10:00:00Z',
    endedAt: '2024-01-14T10:30:00Z',
    summary: '查看了本周生长曲线，体重和身高均在正常范围内',
    messageCount: 15,
  },
  {
    id: 'conv-4',
    userId: 'user-1',
    startedAt: '2024-01-14T20:00:00Z',
    endedAt: '2024-01-14T20:15:00Z',
    summary: '宝宝出现轻微发烧症状，询问了处理方法和就医时机',
    messageCount: 10,
  },
  {
    id: 'conv-5',
    userId: 'user-1',
    startedAt: '2024-01-13T09:00:00Z',
    endedAt: '2024-01-13T09:45:00Z',
    summary: '讨论了辅食添加时间和初次辅食种类选择',
    messageCount: 20,
  },
]

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(date, today)) return '今天'
  if (isSameDay(date, yesterday)) return '昨天'

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function formatConversationTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  return conversations.reduce<Record<string, Conversation[]>>((groups, conv) => {
    const label = formatDateLabel(conv.startedAt)
    if (!groups[label]) groups[label] = []
    groups[label].push(conv)
    return groups
  }, {})
}

export default function HistoryPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return MOCK_CONVERSATIONS
    const q = searchQuery.trim().toLowerCase()
    return MOCK_CONVERSATIONS.filter(
      (c) => c.summary?.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])
  const dateKeys = Object.keys(grouped)

  return (
    <div className="flex flex-col h-screen bg-warm-cream">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-oat-border flex-shrink-0">
        <button
          data-testid="back-button"
          type="button"
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center text-mid-gray active:text-fawn-amber"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-[17px] font-semibold text-soft-charcoal">历史对话</h1>
        <div className="w-10" />
      </header>

      {/* Search */}
      <div className="px-4 py-3 bg-white border-b border-oat-border flex-shrink-0">
        <div className="flex items-center gap-2 bg-warm-gray rounded-[12px] px-3 py-2">
          <Search size={16} className="text-mid-gray flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话记录..."
            className="flex-1 bg-transparent text-[15px] text-soft-charcoal placeholder:text-mid-gray outline-none"
          />
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {dateKeys.length === 0 ? (
          <div
            data-testid="empty-state"
            className="flex flex-col items-center justify-center py-16 gap-3 text-mid-gray"
          >
            <MessageSquare size={40} className="opacity-40" />
            <p className="text-[15px]">没有找到相关对话</p>
          </div>
        ) : (
          dateKeys.map((dateLabel) => (
            <div key={dateLabel}>
              <div
                data-testid="date-group-header"
                className="px-4 py-2 bg-warm-cream"
              >
                <span className="text-[13px] font-medium text-mid-gray">
                  {dateLabel}
                </span>
              </div>
              <div className="bg-white divide-y divide-oat-border">
                {grouped[dateLabel].map((conv) => (
                  <button
                    key={conv.id}
                    data-testid="conversation-item"
                    type="button"
                    onClick={() => router.push(`/chat?conversationId=${conv.id}`)}
                    className={cn(
                      'w-full text-left px-4 py-4 flex flex-col gap-1',
                      'active:bg-amber-50 transition-colors',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-mid-gray">
                        {formatConversationTime(conv.startedAt)}
                      </span>
                      <span
                        data-testid="message-count"
                        className="text-[12px] text-mid-gray"
                      >
                        {conv.messageCount} 条消息
                      </span>
                    </div>
                    {conv.summary && (
                      <p className="text-[15px] text-soft-charcoal line-clamp-2 leading-snug">
                        {conv.summary}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/app/\(main\)/history/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(main\)/history/page.tsx frontend/src/app/\(main\)/history/page.test.tsx
git commit -m "feat(frontend): add chat history page with search and date grouping"
```
### Task 11: Dashboard — Growth Chart & Baby Info Card

**Files:**
- Create: `frontend/src/components/dashboard/BabyInfoCard.tsx`
- Create: `frontend/src/components/dashboard/GrowthChart.tsx`
- Test: `frontend/src/components/dashboard/GrowthChart.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/dashboard/GrowthChart.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { GrowthChart } from './GrowthChart'
import type { GrowthRecord } from '@/lib/types'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`line-${dataKey}`} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  ReferenceArea: () => <div data-testid="reference-area" />,
}))

const mockRecords: GrowthRecord[] = [
  {
    id: '1',
    babyId: 'baby-1',
    date: '2026-01-01',
    weight: 3.5,
    height: 50,
    headCirc: 34,
    whoPercentile: { weight: 50, height: 50, headCirc: 50 },
  },
  {
    id: '2',
    babyId: 'baby-1',
    date: '2026-02-01',
    weight: 4.2,
    height: 53,
    headCirc: 36,
    whoPercentile: { weight: 55, height: 52, headCirc: 52 },
  },
]

describe('GrowthChart', () => {
  it('renders chart container', () => {
    render(<GrowthChart records={mockRecords} metric="weight" onMetricChange={() => {}} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('renders weight toggle button as active when metric is weight', () => {
    render(<GrowthChart records={mockRecords} metric="weight" onMetricChange={() => {}} />)
    const weightBtn = screen.getByRole('button', { name: '体重' })
    expect(weightBtn).toHaveClass('bg-fawn-amber')
  })

  it('renders height toggle button as active when metric is height', () => {
    render(<GrowthChart records={mockRecords} metric="height" onMetricChange={() => {}} />)
    const heightBtn = screen.getByRole('button', { name: '身高' })
    expect(heightBtn).toHaveClass('bg-sage-green')
  })

  it('renders headCirc toggle button as active when metric is headCirc', () => {
    render(<GrowthChart records={mockRecords} metric="headCirc" onMetricChange={() => {}} />)
    const headBtn = screen.getByRole('button', { name: '头围' })
    expect(headBtn).toHaveClass('bg-[#5B9BD5]')
  })

  it('calls onMetricChange when toggle button is clicked', () => {
    const handleChange = vi.fn()
    render(<GrowthChart records={mockRecords} metric="weight" onMetricChange={handleChange} />)
    fireEvent.click(screen.getByRole('button', { name: '身高' }))
    expect(handleChange).toHaveBeenCalledWith('height')
  })

  it('renders with empty records without crashing', () => {
    render(<GrowthChart records={[]} metric="weight" onMetricChange={() => {}} />)
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/GrowthChart.test.tsx`
Expected: FAIL with "Cannot find module './GrowthChart'"

- [ ] **Step 3: Write implementation**

```typescript
// frontend/src/components/dashboard/BabyInfoCard.tsx
import { differenceInMonths, parseISO } from 'date-fns'
import { Venus, Mars } from 'lucide-react'
import type { BabyProfile, GrowthRecord } from '@/lib/types'

interface BabyInfoCardProps {
  baby: BabyProfile
  latestGrowth?: GrowthRecord
}

export function BabyInfoCard({ baby, latestGrowth }: BabyInfoCardProps) {
  const ageMonths = differenceInMonths(new Date(), parseISO(baby.birthDate))
  const GenderIcon = baby.gender === 'female' ? Venus : Mars
  const genderColor = baby.gender === 'female' ? 'text-[#D4956A]' : 'text-[#5B9BD5]'

  return (
    <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 w-16 h-16 rounded-full bg-warm-gray flex items-center justify-center overflow-hidden">
          <span className="text-2xl">🦌</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-semibold text-soft-charcoal truncate">{baby.name}</h2>
            <GenderIcon size={16} className={genderColor} />
          </div>
          <p className="text-[14px] text-mid-gray mt-0.5">
            {ageMonths} 个月
            {baby.isPremature && baby.gestationalWeeks && (
              <span className="ml-1 text-[12px] text-[#F0A030]">
                (早产 {baby.gestationalWeeks}周)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Latest Stats */}
      {latestGrowth && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {latestGrowth.weight !== undefined && (
            <div className="text-center">
              <p className="text-[12px] text-mid-gray">体重</p>
              <p className="text-[20px] font-bold text-soft-charcoal font-mono leading-tight">
                {latestGrowth.weight.toFixed(1)}
              </p>
              <p className="text-[12px] text-mid-gray">kg</p>
              {latestGrowth.whoPercentile?.weight !== undefined && (
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sage-green-light text-[#4A8B52]">
                  P{Math.round(latestGrowth.whoPercentile.weight)}
                </span>
              )}
            </div>
          )}
          {latestGrowth.height !== undefined && (
            <div className="text-center">
              <p className="text-[12px] text-mid-gray">身高</p>
              <p className="text-[20px] font-bold text-soft-charcoal font-mono leading-tight">
                {latestGrowth.height.toFixed(1)}
              </p>
              <p className="text-[12px] text-mid-gray">cm</p>
              {latestGrowth.whoPercentile?.height !== undefined && (
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sage-green-light text-[#4A8B52]">
                  P{Math.round(latestGrowth.whoPercentile.height)}
                </span>
              )}
            </div>
          )}
          {latestGrowth.headCirc !== undefined && (
            <div className="text-center">
              <p className="text-[12px] text-mid-gray">头围</p>
              <p className="text-[20px] font-bold text-soft-charcoal font-mono leading-tight">
                {latestGrowth.headCirc.toFixed(1)}
              </p>
              <p className="text-[12px] text-mid-gray">cm</p>
              {latestGrowth.whoPercentile?.headCirc !== undefined && (
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sage-green-light text-[#4A8B52]">
                  P{Math.round(latestGrowth.whoPercentile.headCirc)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

```typescript
// frontend/src/components/dashboard/GrowthChart.tsx
'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceArea,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { GrowthRecord } from '@/lib/types'

type Metric = 'weight' | 'height' | 'headCirc'

interface GrowthChartProps {
  records: GrowthRecord[]
  metric: Metric
  onMetricChange: (metric: Metric) => void
}

const METRIC_CONFIG: Record<
  Metric,
  { label: string; unit: string; color: string; activeClass: string; key: keyof GrowthRecord }
> = {
  weight: {
    label: '体重',
    unit: 'kg',
    color: '#D4956A',
    activeClass: 'bg-fawn-amber text-white',
    key: 'weight',
  },
  height: {
    label: '身高',
    unit: 'cm',
    color: '#7FB685',
    activeClass: 'bg-sage-green text-white',
    key: 'height',
  },
  headCirc: {
    label: '头围',
    unit: 'cm',
    color: '#5B9BD5',
    activeClass: 'bg-[#5B9BD5] text-white',
    key: 'headCirc',
  },
}

// WHO 3rd–97th percentile reference bands (approximate, for 0–6 months)
const WHO_REFERENCE: Record<Metric, { low3: number; low15: number; median: number; high85: number; high97: number }> = {
  weight: { low3: 2.9, low15: 3.2, median: 3.9, high85: 4.8, high97: 5.5 },
  height: { low3: 46, low15: 47.5, median: 50, high85: 52.5, high97: 54 },
  headCirc: { low3: 31, low15: 32, median: 34, high85: 35.5, high97: 37 },
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  unit: string
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="bg-white border border-oat-border rounded-[12px] shadow-card px-3 py-2">
      <p className="text-[12px] text-mid-gray">{label}</p>
      <p className="text-[14px] font-semibold text-soft-charcoal font-mono">
        {payload[0].value}
        <span className="font-normal text-mid-gray ml-0.5">{unit}</span>
      </p>
    </div>
  )
}

export function GrowthChart({ records, metric, onMetricChange }: GrowthChartProps) {
  const config = METRIC_CONFIG[metric]
  const ref = WHO_REFERENCE[metric]

  const chartData = records
    .filter((r) => r[config.key] !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: format(parseISO(r.date), 'MM/dd'),
      value: r[config.key] as number,
    }))

  return (
    <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[17px] font-semibold text-soft-charcoal">生长曲线</h3>
        <div className="flex gap-1.5">
          {(Object.keys(METRIC_CONFIG) as Metric[]).map((m) => {
            const cfg = METRIC_CONFIG[m]
            const isActive = m === metric
            return (
              <button
                key={m}
                onClick={() => onMetricChange(m)}
                className={`px-3 py-1 rounded-btn text-[12px] font-medium transition-colors ${
                  isActive
                    ? cfg.activeClass
                    : 'bg-warm-gray text-mid-gray'
                }`}
              >
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5DED5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#8E8E93' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#8E8E93' }}
            axisLine={false}
            tickLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip content={<CustomTooltip unit={config.unit} />} />
          {/* WHO 3rd–97th percentile band */}
          <ReferenceArea
            y1={ref.low3}
            y2={ref.high97}
            fill="rgba(212, 149, 106, 0.1)"
            stroke="#C8C0B8"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={config.color}
            strokeWidth={2}
            dot={{ r: 4, fill: config.color, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: config.color }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-4 justify-end">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ backgroundColor: config.color }} />
          <span className="text-[11px] text-mid-gray">实测值</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(212, 149, 106, 0.15)', border: '1px dashed #C8C0B8' }} />
          <span className="text-[11px] text-mid-gray">WHO P3–P97</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/GrowthChart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/BabyInfoCard.tsx frontend/src/components/dashboard/GrowthChart.tsx frontend/src/components/dashboard/GrowthChart.test.tsx
git commit -m "feat(frontend): add BabyInfoCard and GrowthChart dashboard components"
```

---

### Task 12: Dashboard — Stats & Page Assembly

**Files:**
- Create: `frontend/src/components/dashboard/FeedingStats.tsx`
- Create: `frontend/src/components/dashboard/SleepStats.tsx`
- Create: `frontend/src/components/dashboard/HealthTimeline.tsx`
- Create: `frontend/src/app/(main)/dashboard/page.tsx`
- Test: `frontend/src/components/dashboard/FeedingStats.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/dashboard/FeedingStats.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { FeedingStats } from './FeedingStats'
import type { FeedingRecord } from '@/lib/types'

const today = new Date().toISOString()

const mockRecords: FeedingRecord[] = [
  { id: '1', babyId: 'b1', time: today, method: 'formula', amount: 120, note: '' },
  { id: '2', babyId: 'b1', time: today, method: 'formula', amount: 100, note: '' },
  { id: '3', babyId: 'b1', time: today, method: 'breast', note: '' },
]

describe('FeedingStats', () => {
  it('renders feeding count for today', () => {
    render(<FeedingStats records={mockRecords} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders total formula amount', () => {
    render(<FeedingStats records={mockRecords} />)
    expect(screen.getByText('220')).toBeInTheDocument()
  })

  it('renders section title', () => {
    render(<FeedingStats records={mockRecords} />)
    expect(screen.getByText('喂养统计')).toBeInTheDocument()
  })

  it('renders with empty records', () => {
    render(<FeedingStats records={[]} />)
    expect(screen.getByText('喂养统计')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dashboard/FeedingStats.test.tsx`
Expected: FAIL with "Cannot find module './FeedingStats'"

- [ ] **Step 3: Write implementation**

```typescript
// frontend/src/components/dashboard/FeedingStats.tsx
import { Droplets } from 'lucide-react'
import { isToday, parseISO } from 'date-fns'
import type { FeedingRecord } from '@/lib/types'

interface FeedingStatsProps {
  records: FeedingRecord[]
}

export function FeedingStats({ records }: FeedingStatsProps) {
  const todayRecords = records.filter((r) => isToday(parseISO(r.time)))
  const totalAmount = todayRecords
    .filter((r) => r.amount !== undefined)
    .reduce((sum, r) => sum + (r.amount ?? 0), 0)
  const feedingCount = todayRecords.length
  const breastCount = todayRecords.filter((r) => r.method === 'breast').length
  const formulaCount = todayRecords.filter((r) => r.method === 'formula').length

  const lastFeeding =
    todayRecords.length > 0
      ? todayRecords.sort((a, b) => b.time.localeCompare(a.time))[0]
      : null

  const formatTime = (iso: string) => {
    const d = parseISO(iso)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Droplets size={16} className="text-fawn-amber" />
        <h3 className="text-[14px] font-semibold text-soft-charcoal">喂养统计</h3>
      </div>

      {/* Feed Count */}
      <div className="mb-3">
        <p className="text-[11px] text-mid-gray">今日次数</p>
        <p className="text-[28px] font-bold text-soft-charcoal font-mono leading-tight">
          {feedingCount}
        </p>
      </div>

      {/* Amount */}
      {totalAmount > 0 && (
        <div className="mb-3">
          <p className="text-[11px] text-mid-gray">配方奶量</p>
          <p className="text-[20px] font-bold text-soft-charcoal font-mono leading-tight">
            {totalAmount}
            <span className="text-[12px] font-normal text-mid-gray ml-0.5">ml</span>
          </p>
        </div>
      )}

      {/* Method breakdown */}
      <div className="flex gap-2 mb-3">
        {breastCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-[#F2DFD0] text-[11px] text-[#A06840]">
            母乳 {breastCount}次
          </span>
        )}
        {formulaCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-sage-green-light text-[11px] text-[#4A8B52]">
            配方 {formulaCount}次
          </span>
        )}
      </div>

      {/* Last feeding */}
      {lastFeeding && (
        <div>
          <p className="text-[11px] text-mid-gray">上次喂奶</p>
          <p className="text-[14px] font-medium text-dark-gray font-mono">
            {formatTime(lastFeeding.time)}
          </p>
        </div>
      )}
    </div>
  )
}
```

```typescript
// frontend/src/components/dashboard/SleepStats.tsx
import { Moon } from 'lucide-react'
import { isToday, differenceInMinutes, parseISO } from 'date-fns'
import type { SleepRecord } from '@/lib/types'

interface SleepStatsProps {
  records: SleepRecord[]
}

export function SleepStats({ records }: SleepStatsProps) {
  const todayRecords = records.filter((r) => isToday(parseISO(r.startTime)))

  const totalMinutes = todayRecords.reduce((sum, r) => {
    const mins = differenceInMinutes(parseISO(r.endTime), parseISO(r.startTime))
    return sum + (mins > 0 ? mins : 0)
  }, 0)

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  const avgNightWakings =
    todayRecords.length > 0
      ? Math.round(
          todayRecords.reduce((sum, r) => sum + r.nightWakings, 0) / todayRecords.length
        )
      : 0

  const lastSleep =
    todayRecords.length > 0
      ? todayRecords.sort((a, b) => b.startTime.localeCompare(a.startTime))[0]
      : null

  const formatDuration = (iso: string) => {
    const mins = differenceInMinutes(
      parseISO(lastSleep!.endTime),
      parseISO(iso)
    )
    if (mins < 60) return `${mins}分钟`
    return `${Math.floor(mins / 60)}小时${mins % 60 > 0 ? `${mins % 60}分` : ''}`
  }

  return (
    <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Moon size={16} className="text-[#5B9BD5]" />
        <h3 className="text-[14px] font-semibold text-soft-charcoal">睡眠统计</h3>
      </div>

      {/* Total sleep */}
      <div className="mb-3">
        <p className="text-[11px] text-mid-gray">今日睡眠</p>
        <p className="text-[28px] font-bold text-soft-charcoal font-mono leading-tight">
          {totalMinutes > 0 ? `${hours}h${minutes > 0 ? `${minutes}m` : ''}` : '—'}
        </p>
      </div>

      {/* Night wakings */}
      <div className="mb-3">
        <p className="text-[11px] text-mid-gray">夜醒次数</p>
        <p className="text-[20px] font-bold text-soft-charcoal font-mono leading-tight">
          {avgNightWakings}
          <span className="text-[12px] font-normal text-mid-gray ml-0.5">次</span>
        </p>
      </div>

      {/* Last sleep duration */}
      {lastSleep && (
        <div>
          <p className="text-[11px] text-mid-gray">上次小睡</p>
          <p className="text-[14px] font-medium text-dark-gray">
            {formatDuration(lastSleep.startTime)}
          </p>
        </div>
      )}
    </div>
  )
}
```

```typescript
// frontend/src/components/dashboard/HealthTimeline.tsx
import { Shield, AlertCircle, Stethoscope } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { HealthRecord } from '@/lib/types'

interface HealthTimelineProps {
  records: HealthRecord[]
}

const TYPE_CONFIG = {
  vaccine: {
    icon: Shield,
    color: 'text-[#5B9BD5]',
    dotColor: 'bg-[#5B9BD5]',
    bgColor: 'bg-[#EBF3FB]',
    label: '疫苗',
  },
  illness: {
    icon: AlertCircle,
    color: 'text-[#E25B45]',
    dotColor: 'bg-[#E25B45]',
    bgColor: 'bg-[#FDEEEB]',
    label: '生病',
  },
  visit: {
    icon: Stethoscope,
    color: 'text-[#7FB685]',
    dotColor: 'bg-[#7FB685]',
    bgColor: 'bg-[#DFF0E2]',
    label: '就诊',
  },
} as const

export function HealthTimeline({ records }: HealthTimelineProps) {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
      <h3 className="text-[17px] font-semibold text-soft-charcoal mb-4">健康时间线</h3>

      {sorted.length === 0 ? (
        <p className="text-[14px] text-mid-gray text-center py-6">暂无健康记录</p>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-oat-border" />

          <div className="space-y-4">
            {sorted.map((record, index) => {
              const cfg = TYPE_CONFIG[record.type]
              const Icon = cfg.icon
              return (
                <div key={record.id} className="flex gap-3 relative">
                  {/* Dot */}
                  <div
                    className={`flex-shrink-0 w-[38px] h-[38px] rounded-full ${cfg.bgColor} flex items-center justify-center z-10`}
                  >
                    <Icon size={16} className={cfg.color} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.bgColor} ${cfg.color}`}
                          >
                            {cfg.label}
                          </span>
                          <p className="text-[15px] font-medium text-soft-charcoal">
                            {record.title}
                          </p>
                        </div>
                        {record.description && (
                          <p className="text-[13px] text-dark-gray mt-1 leading-relaxed">
                            {record.description}
                          </p>
                        )}
                      </div>
                      <p className="flex-shrink-0 text-[12px] text-mid-gray">
                        {format(parseISO(record.date), 'MM/dd')}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

```typescript
// frontend/src/app/(main)/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { BabyInfoCard } from '@/components/dashboard/BabyInfoCard'
import { GrowthChart } from '@/components/dashboard/GrowthChart'
import { FeedingStats } from '@/components/dashboard/FeedingStats'
import { SleepStats } from '@/components/dashboard/SleepStats'
import { HealthTimeline } from '@/components/dashboard/HealthTimeline'
import {
  getBabyProfile,
  getGrowthRecords,
  getFeedingRecords,
  getSleepRecords,
  getHealthRecords,
} from '@/lib/api'
import type { BabyProfile, GrowthRecord, FeedingRecord, SleepRecord, HealthRecord } from '@/lib/types'

type GrowthMetric = 'weight' | 'height' | 'headCirc'

export default function DashboardPage() {
  const [baby, setBaby] = useState<BabyProfile | null>(null)
  const [growthRecords, setGrowthRecords] = useState<GrowthRecord[]>([])
  const [feedingRecords, setFeedingRecords] = useState<FeedingRecord[]>([])
  const [sleepRecords, setSleepRecords] = useState<SleepRecord[]>([])
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([])
  const [growthMetric, setGrowthMetric] = useState<GrowthMetric>('weight')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [babyData, growth, feeding, sleep, health] = await Promise.all([
          getBabyProfile(),
          getGrowthRecords(),
          getFeedingRecords(),
          getSleepRecords(),
          getHealthRecords(),
        ])
        setBaby(babyData)
        setGrowthRecords(growth)
        setFeedingRecords(feeding)
        setSleepRecords(sleep)
        setHealthRecords(health)
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const latestGrowth =
    growthRecords.length > 0
      ? [...growthRecords].sort((a, b) => b.date.localeCompare(a.date))[0]
      : undefined

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-fawn-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-[14px] text-mid-gray">加载中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold text-soft-charcoal">数据看板</h1>
      </div>

      {/* Baby Info Card */}
      {baby && <BabyInfoCard baby={baby} latestGrowth={latestGrowth} />}

      {/* Growth Chart */}
      {growthRecords.length > 0 && (
        <GrowthChart
          records={growthRecords}
          metric={growthMetric}
          onMetricChange={setGrowthMetric}
        />
      )}

      {/* Feeding + Sleep grid */}
      <div className="grid grid-cols-2 gap-3">
        <FeedingStats records={feedingRecords} />
        <SleepStats records={sleepRecords} />
      </div>

      {/* Health Timeline */}
      <HealthTimeline records={healthRecords} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dashboard/FeedingStats.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/FeedingStats.tsx frontend/src/components/dashboard/SleepStats.tsx frontend/src/components/dashboard/HealthTimeline.tsx frontend/src/app/(main)/dashboard/page.tsx frontend/src/components/dashboard/FeedingStats.test.tsx
git commit -m "feat(frontend): add FeedingStats, SleepStats, HealthTimeline and assemble dashboard page"
```

---

### Task 13: Album Page

**Files:**
- Create: `frontend/src/components/album/PhotoGrid.tsx`
- Create: `frontend/src/components/album/PhotoViewer.tsx`
- Create: `frontend/src/components/album/UploadButton.tsx`
- Create: `frontend/src/app/(main)/album/page.tsx`
- Test: `frontend/src/components/album/PhotoGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/components/album/PhotoGrid.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PhotoGrid } from './PhotoGrid'
import type { Photo } from '@/lib/types'

const mockPhotos: Photo[] = [
  {
    id: '1',
    babyId: 'b1',
    url: 'https://example.com/photo1.jpg',
    thumbnailUrl: 'https://example.com/thumb1.jpg',
    uploadedAt: '2026-01-15T10:00:00Z',
    uploadedBy: 'user-1',
    tags: [{ label: '睡觉', confidence: 0.95, source: 'ai' }],
  },
  {
    id: '2',
    babyId: 'b1',
    url: 'https://example.com/photo2.jpg',
    thumbnailUrl: 'https://example.com/thumb2.jpg',
    uploadedAt: '2026-02-10T14:00:00Z',
    uploadedBy: 'user-1',
    tags: [{ label: '户外', confidence: 0.88, source: 'ai' }],
    milestone: { type: '第一次翻身', confirmed: true, confidence: 0.92 },
  },
  {
    id: '3',
    babyId: 'b1',
    url: 'https://example.com/photo3.jpg',
    thumbnailUrl: 'https://example.com/thumb3.jpg',
    uploadedAt: '2026-01-20T09:00:00Z',
    uploadedBy: 'user-1',
    tags: [{ label: '睡觉', confidence: 0.9, source: 'ai' }],
  },
]

describe('PhotoGrid', () => {
  it('renders all photos in timeline mode', () => {
    render(
      <PhotoGrid photos={mockPhotos} viewMode="timeline" onPhotoSelect={() => {}} />
    )
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(3)
  })

  it('renders month headers in timeline mode', () => {
    render(
      <PhotoGrid photos={mockPhotos} viewMode="timeline" onPhotoSelect={() => {}} />
    )
    expect(screen.getByText('2026年1月')).toBeInTheDocument()
    expect(screen.getByText('2026年2月')).toBeInTheDocument()
  })

  it('renders only milestone photos in milestone mode', () => {
    render(
      <PhotoGrid photos={mockPhotos} viewMode="milestone" onPhotoSelect={() => {}} />
    )
    const images = screen.getAllByRole('img')
    expect(images).toHaveLength(1)
  })

  it('groups photos by tag in scene mode', () => {
    render(
      <PhotoGrid photos={mockPhotos} viewMode="scene" onPhotoSelect={() => {}} />
    )
    expect(screen.getByText('睡觉')).toBeInTheDocument()
  })

  it('calls onPhotoSelect when a photo is clicked', () => {
    const handleSelect = vi.fn()
    render(
      <PhotoGrid photos={mockPhotos} viewMode="timeline" onPhotoSelect={handleSelect} />
    )
    fireEvent.click(screen.getAllByRole('img')[0])
    expect(handleSelect).toHaveBeenCalledWith(mockPhotos[0])
  })

  it('renders empty state when no photos', () => {
    render(
      <PhotoGrid photos={[]} viewMode="timeline" onPhotoSelect={() => {}} />
    )
    expect(screen.getByText('暂无照片')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/album/PhotoGrid.test.tsx`
Expected: FAIL with "Cannot find module './PhotoGrid'"

- [ ] **Step 3: Write implementation**

```typescript
// frontend/src/components/album/PhotoGrid.tsx
import { format, parseISO } from 'date-fns'
import { Star } from 'lucide-react'
import type { Photo } from '@/lib/types'

type ViewMode = 'timeline' | 'scene' | 'milestone'

interface PhotoGridProps {
  photos: Photo[]
  viewMode: ViewMode
  onPhotoSelect: (photo: Photo) => void
}

interface PhotoTileProps {
  photo: Photo
  onSelect: (photo: Photo) => void
}

function PhotoTile({ photo, onSelect }: PhotoTileProps) {
  const topTag = photo.tags.length > 0 ? photo.tags[0] : null
  const dateLabel = format(parseISO(photo.uploadedAt), 'MM/dd')

  return (
    <button
      onClick={() => onSelect(photo)}
      className="relative w-full aspect-square overflow-hidden rounded-[8px] bg-warm-gray focus:outline-none focus:ring-2 focus:ring-fawn-amber"
    >
      <img
        src={photo.thumbnailUrl}
        alt={topTag?.label ?? '宝宝照片'}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1.5">
        <div className="flex items-end justify-between">
          <span className="text-[10px] text-white/90 font-medium leading-tight">
            {dateLabel}
          </span>
          {topTag && (
            <span className="text-[10px] text-white/80 leading-tight truncate max-w-[60%] text-right">
              {topTag.label}
            </span>
          )}
        </div>
      </div>
      {/* Milestone badge */}
      {photo.milestone && (
        <div className="absolute top-1.5 right-1.5">
          <div className="w-5 h-5 rounded-full bg-[#F0A030] flex items-center justify-center">
            <Star size={10} className="text-white" fill="white" />
          </div>
        </div>
      )}
    </button>
  )
}

function TimelineView({ photos, onPhotoSelect }: { photos: Photo[]; onPhotoSelect: (p: Photo) => void }) {
  const grouped: Record<string, Photo[]> = {}
  const sorted = [...photos].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))

  for (const photo of sorted) {
    const key = format(parseISO(photo.uploadedAt), 'yyyy年M月')
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(photo)
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([month, groupPhotos]) => (
        <div key={month}>
          <h4 className="text-[14px] font-semibold text-soft-charcoal mb-2 px-1">{month}</h4>
          <div className="grid grid-cols-3 gap-0.5">
            {groupPhotos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} onSelect={onPhotoSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SceneView({ photos, onPhotoSelect }: { photos: Photo[]; onPhotoSelect: (p: Photo) => void }) {
  const grouped: Record<string, Photo[]> = {}

  for (const photo of photos) {
    if (photo.tags.length === 0) {
      const key = '其他'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(photo)
    } else {
      const topTag = photo.tags.sort((a, b) => b.confidence - a.confidence)[0]
      if (!grouped[topTag.label]) grouped[topTag.label] = []
      grouped[topTag.label].push(photo)
    }
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([scene, groupPhotos]) => (
        <div key={scene}>
          <h4 className="text-[14px] font-semibold text-soft-charcoal mb-2 px-1">{scene}</h4>
          <div className="grid grid-cols-3 gap-0.5">
            {groupPhotos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} onSelect={onPhotoSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MilestoneView({ photos, onPhotoSelect }: { photos: Photo[]; onPhotoSelect: (p: Photo) => void }) {
  const milestonePhotos = photos.filter((p) => p.milestone)
  const grouped: Record<string, Photo[]> = {}

  for (const photo of milestonePhotos) {
    const key = photo.milestone!.type
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(photo)
  }

  if (milestonePhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Star size={32} className="text-mid-gray" />
        <p className="text-[14px] text-mid-gray">暂无里程碑照片</p>
        <p className="text-[12px] text-mid-gray text-center px-8">
          上传照片后，AI 会自动检测里程碑时刻
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([milestone, groupPhotos]) => (
        <div key={milestone}>
          <div className="flex items-center gap-2 mb-2 px-1">
            <Star size={14} className="text-[#F0A030]" fill="#F0A030" />
            <h4 className="text-[14px] font-semibold text-soft-charcoal">{milestone}</h4>
          </div>
          <div className="grid grid-cols-3 gap-0.5">
            {groupPhotos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} onSelect={onPhotoSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PhotoGrid({ photos, viewMode, onPhotoSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-[14px] text-mid-gray">暂无照片</p>
        <p className="text-[12px] text-mid-gray">点击右下角按钮上传宝宝照片</p>
      </div>
    )
  }

  if (viewMode === 'timeline') {
    return <TimelineView photos={photos} onPhotoSelect={onPhotoSelect} />
  }
  if (viewMode === 'scene') {
    return <SceneView photos={photos} onPhotoSelect={onPhotoSelect} />
  }
  return <MilestoneView photos={photos} onPhotoSelect={onPhotoSelect} />
}
```

```typescript
// frontend/src/components/album/PhotoViewer.tsx
'use client'

import { useEffect } from 'react'
import { X, Star } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Photo } from '@/lib/types'

interface PhotoViewerProps {
  photo: Photo
  onClose: () => void
}

export function PhotoViewer({ photo, onClose }: PhotoViewerProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe-top py-3">
        <p className="text-[14px] text-white/70">
          {format(parseISO(photo.uploadedAt), 'yyyy年M月d日')}
        </p>
        <button
          onClick={onClose}
          className="w-[44px] h-[44px] flex items-center justify-center rounded-full bg-white/10 active:bg-white/20 transition-colors"
          aria-label="关闭"
        >
          <X size={20} className="text-white" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
        <img
          src={photo.url}
          alt={photo.tags[0]?.label ?? '宝宝照片'}
          className="max-w-full max-h-full object-contain rounded-[8px]"
        />
      </div>

      {/* Bottom panel */}
      <div className="bg-black/60 backdrop-blur-sm px-4 pt-4 pb-safe-bottom pb-6">
        {/* Milestone */}
        {photo.milestone && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0A030]/20 border border-[#F0A030]/40">
              <Star size={14} className="text-[#F0A030]" fill="#F0A030" />
              <span className="text-[13px] font-medium text-[#F0A030]">
                {photo.milestone.type}
              </span>
              {photo.milestone.confirmed ? (
                <span className="text-[11px] text-[#F0A030]/70">已确认</span>
              ) : (
                <span className="text-[11px] text-white/50">
                  待确认 ({Math.round(photo.milestone.confidence * 100)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* AI Tags */}
        {photo.tags.length > 0 && (
          <div>
            <p className="text-[12px] text-white/50 mb-2">AI 标签</p>
            <div className="flex flex-wrap gap-2">
              {photo.tags.map((tag, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20"
                >
                  <span className="text-[13px] text-white/90">{tag.label}</span>
                  <span className="text-[11px] text-white/50">
                    {Math.round(tag.confidence * 100)}%
                  </span>
                  {tag.source === 'manual' && (
                    <span className="text-[10px] text-white/40">手动</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

```typescript
// frontend/src/components/album/UploadButton.tsx
'use client'

import { useRef } from 'react'
import { Camera } from 'lucide-react'

interface UploadButtonProps {
  onUpload: (files: FileList) => void
}

export function UploadButton({ onUpload }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    inputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files)
      // Reset input so the same file can be re-selected
      e.target.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
        aria-label="上传照片"
      />
      <button
        onClick={handleClick}
        className="fixed bottom-[calc(49px+env(safe-area-inset-bottom)+16px)] right-4 w-14 h-14 rounded-full bg-fawn-amber shadow-[0_4px_12px_rgba(0,0,0,0.08)] flex items-center justify-center active:opacity-85 transition-opacity z-30"
        aria-label="上传照片"
      >
        <Camera size={24} className="text-white" />
      </button>
    </>
  )
}
```

```typescript
// frontend/src/app/(main)/album/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { PhotoGrid } from '@/components/album/PhotoGrid'
import { PhotoViewer } from '@/components/album/PhotoViewer'
import { UploadButton } from '@/components/album/UploadButton'
import { getPhotos, uploadPhoto } from '@/lib/api'
import type { Photo } from '@/lib/types'

type ViewMode = 'timeline' | 'scene' | 'milestone'

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'timeline', label: '时间线' },
  { key: 'scene', label: '场景' },
  { key: 'milestone', label: '里程碑' },
]

export default function AlbumPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const data = await getPhotos()
        setPhotos(data)
      } catch (err) {
        console.error('Failed to load photos', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleUpload = async (files: FileList) => {
    setUploading(true)
    try {
      const uploaded: Photo[] = []
      for (const file of Array.from(files)) {
        const photo = await uploadPhoto(file)
        uploaded.push(photo)
      }
      setPhotos((prev) => [...uploaded, ...prev])
    } catch (err) {
      console.error('Upload failed', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-warm-cream">
        <h1 className="text-[20px] font-semibold text-soft-charcoal mb-3">相册</h1>

        {/* View mode toggle */}
        <div className="flex gap-1.5 bg-warm-gray rounded-btn p-1">
          {VIEW_MODES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`flex-1 py-2 rounded-[10px] text-[14px] font-medium transition-colors ${
                viewMode === key
                  ? 'bg-white text-soft-charcoal shadow-card'
                  : 'text-mid-gray'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-fawn-amber border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {uploading && (
              <div className="flex items-center gap-2 py-3 px-4 mb-3 bg-[#F2DFD0] rounded-[12px]">
                <div className="w-4 h-4 border-2 border-fawn-amber border-t-transparent rounded-full animate-spin" />
                <p className="text-[14px] text-[#A06840]">正在上传并分析照片…</p>
              </div>
            )}
            <PhotoGrid
              photos={photos}
              viewMode={viewMode}
              onPhotoSelect={setSelectedPhoto}
            />
          </>
        )}
      </div>

      {/* Upload FAB */}
      <UploadButton onUpload={handleUpload} />

      {/* Photo Viewer Modal */}
      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/album/PhotoGrid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/album/PhotoGrid.tsx frontend/src/components/album/PhotoViewer.tsx frontend/src/components/album/UploadButton.tsx frontend/src/app/(main)/album/page.tsx frontend/src/components/album/PhotoGrid.test.tsx
git commit -m "feat(frontend): add album page with PhotoGrid, PhotoViewer, and UploadButton"
```

---

### Task 14: Profile Page

**Files:**
- Create: `frontend/src/app/(main)/profile/page.tsx`
- Test: `frontend/src/app/(main)/profile/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/app/(main)/profile/page.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth store
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: vi.fn(() => ({
    user: { id: 'u1', name: '张妈妈', role: 'admin', avatarUrl: undefined },
    logout: vi.fn(),
  })),
}))

// Mock API
vi.mock('@/lib/api', () => ({
  getBabyProfile: vi.fn().mockResolvedValue({
    id: 'b1',
    name: '小明',
    gender: 'male',
    birthDate: '2026-01-01',
    birthWeight: 3.2,
    birthHeight: 49,
    birthHeadCirc: 33,
    isPremature: false,
  }),
  getProfileItems: vi.fn().mockResolvedValue([
    {
      id: 'p1',
      userId: 'u1',
      content: '母乳喂养中，多次询问奶量是否足够',
      sourceConversationId: 'conv-1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ]),
  getFamilyMembers: vi.fn().mockResolvedValue([
    { id: 'u1', name: '张妈妈', role: 'admin', avatarUrl: undefined },
    { id: 'u2', name: '张爸爸', role: 'parent', avatarUrl: undefined },
  ]),
  updateProfileItem: vi.fn().mockResolvedValue({}),
  deleteProfileItem: vi.fn().mockResolvedValue({}),
  updateBabyProfile: vi.fn().mockResolvedValue({}),
}))

import ProfilePage from './page'

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders user name', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText('张妈妈')).toBeInTheDocument())
  })

  it('renders admin role label', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText('管理员')).toBeInTheDocument())
  })

  it('renders profile item content', async () => {
    render(<ProfilePage />)
    await waitFor(() =>
      expect(screen.getByText('母乳喂养中，多次询问奶量是否足够')).toBeInTheDocument()
    )
  })

  it('renders baby name', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText('小明')).toBeInTheDocument())
  })

  it('renders family members section for admin', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText('家庭成员')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('张爸爸')).toBeInTheDocument())
  })

  it('renders settings section with logout button', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(screen.getByText('退出登录')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/app/(main)/profile/page.test.tsx`
Expected: FAIL with "Cannot find module './page'"

- [ ] **Step 3: Write implementation**

```typescript
// frontend/src/app/(main)/profile/page.tsx
'use client'

import { useState, useEffect } from 'react'
import {
  User,
  Baby,
  Users,
  Settings,
  Pencil,
  Trash2,
  LogOut,
  Plus,
  ChevronRight,
  Check,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'
import {
  getBabyProfile,
  getProfileItems,
  getFamilyMembers,
  updateProfileItem,
  deleteProfileItem,
  updateBabyProfile,
} from '@/lib/api'
import type { BabyProfile, ProfileItem, User as UserType } from '@/lib/types'

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  parent: '家长',
  family: '家庭成员',
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#D4956A',
  parent: '#5B9BD5',
  family: '#B07CC6',
}

function getInitials(name: string) {
  return name.slice(-2)
}

interface EditableProfileItemProps {
  item: ProfileItem
  onUpdate: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function EditableProfileItem({ item, onUpdate, onDelete }: EditableProfileItemProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(item.content)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await onUpdate(item.id, value.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setValue(item.content)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-start gap-2 py-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 text-[14px] text-soft-charcoal bg-warm-gray rounded-[10px] px-3 py-2 resize-none border border-oat-border focus:outline-none focus:border-fawn-amber"
          rows={2}
          autoFocus
        />
        <div className="flex flex-col gap-1.5 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-8 h-8 rounded-full bg-sage-green flex items-center justify-center active:opacity-80"
            aria-label="保存"
          >
            <Check size={14} className="text-white" />
          </button>
          <button
            onClick={handleCancel}
            className="w-8 h-8 rounded-full bg-warm-gray flex items-center justify-center active:opacity-80"
            aria-label="取消"
          >
            <X size={14} className="text-mid-gray" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-oat-border last:border-0">
      <div className="w-1.5 h-1.5 rounded-full bg-fawn-amber mt-2 flex-shrink-0" />
      <p className="flex-1 text-[14px] text-soft-charcoal leading-relaxed">{item.content}</p>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-warm-gray transition-colors"
          aria-label="编辑"
        >
          <Pencil size={14} className="text-mid-gray" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[#FDEEEB] transition-colors"
          aria-label="删除"
        >
          <Trash2 size={14} className="text-mid-gray" />
        </button>
      </div>
    </div>
  )
}

interface BabyProfileCardProps {
  baby: BabyProfile
  canEdit: boolean
  onUpdate: (baby: Partial<BabyProfile>) => Promise<void>
}

function BabyProfileCard({ baby, canEdit, onUpdate }: BabyProfileCardProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(baby.name)
  const [birthDate, setBirthDate] = useState(baby.birthDate)
  const [birthWeight, setBirthWeight] = useState(String(baby.birthWeight))
  const [birthHeight, setBirthHeight] = useState(String(baby.birthHeight))
  const [birthHeadCirc, setBirthHeadCirc] = useState(String(baby.birthHeadCirc))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate({
        name,
        birthDate,
        birthWeight: parseFloat(birthWeight),
        birthHeight: parseFloat(birthHeight),
        birthHeadCirc: parseFloat(birthHeadCirc),
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Baby size={16} className="text-fawn-amber" />
          <h3 className="text-[17px] font-semibold text-soft-charcoal">宝宝档案</h3>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-warm-gray transition-colors"
            aria-label="编辑宝宝档案"
          >
            <Pencil size={16} className="text-mid-gray" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-[12px] text-mid-gray block mb-1">姓名</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border border-oat-border text-[14px] text-soft-charcoal bg-warm-gray focus:outline-none focus:border-fawn-amber"
            />
          </div>
          <div>
            <label className="text-[12px] text-mid-gray block mb-1">出生日期</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border border-oat-border text-[14px] text-soft-charcoal bg-warm-gray focus:outline-none focus:border-fawn-amber"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[12px] text-mid-gray block mb-1">出生体重(kg)</label>
              <input
                type="number"
                step="0.01"
                value={birthWeight}
                onChange={(e) => setBirthWeight(e.target.value)}
                className="w-full px-2 py-2 rounded-[10px] border border-oat-border text-[14px] text-soft-charcoal bg-warm-gray font-mono focus:outline-none focus:border-fawn-amber"
              />
            </div>
            <div>
              <label className="text-[12px] text-mid-gray block mb-1">出生身高(cm)</label>
              <input
                type="number"
                step="0.1"
                value={birthHeight}
                onChange={(e) => setBirthHeight(e.target.value)}
                className="w-full px-2 py-2 rounded-[10px] border border-oat-border text-[14px] text-soft-charcoal bg-warm-gray font-mono focus:outline-none focus:border-fawn-amber"
              />
            </div>
            <div>
              <label className="text-[12px] text-mid-gray block mb-1">出生头围(cm)</label>
              <input
                type="number"
                step="0.1"
                value={birthHeadCirc}
                onChange={(e) => setBirthHeadCirc(e.target.value)}
                className="w-full px-2 py-2 rounded-[10px] border border-oat-border text-[14px] text-soft-charcoal bg-warm-gray font-mono focus:outline-none focus:border-fawn-amber"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-btn bg-fawn-amber text-white text-[14px] font-semibold active:opacity-85 disabled:opacity-60 transition-opacity"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 py-2.5 rounded-btn bg-warm-gray text-mid-gray text-[14px] font-semibold active:opacity-80 transition-opacity"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between py-1.5 border-b border-oat-border">
            <span className="text-[14px] text-mid-gray">姓名</span>
            <span className="text-[14px] font-medium text-soft-charcoal">{baby.name}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-oat-border">
            <span className="text-[14px] text-mid-gray">性别</span>
            <span className="text-[14px] font-medium text-soft-charcoal">
              {baby.gender === 'male' ? '男宝宝' : '女宝宝'}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-oat-border">
            <span className="text-[14px] text-mid-gray">出生日期</span>
            <span className="text-[14px] font-medium text-soft-charcoal font-mono">
              {baby.birthDate}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-oat-border">
            <span className="text-[14px] text-mid-gray">出生体重</span>
            <span className="text-[14px] font-medium text-soft-charcoal font-mono">
              {baby.birthWeight} kg
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-oat-border">
            <span className="text-[14px] text-mid-gray">出生身高</span>
            <span className="text-[14px] font-medium text-soft-charcoal font-mono">
              {baby.birthHeight} cm
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[14px] text-mid-gray">出生头围</span>
            <span className="text-[14px] font-medium text-soft-charcoal font-mono">
              {baby.birthHeadCirc} cm
            </span>
          </div>
          {baby.isPremature && baby.gestationalWeeks && (
            <div className="mt-2 px-3 py-2 bg-[#FFF3E0] rounded-[10px]">
              <p className="text-[12px] text-[#A06020]">
                早产儿，孕 {baby.gestationalWeeks} 周出生
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { user, logout } = useAuthStore()
  const [baby, setBaby] = useState<BabyProfile | null>(null)
  const [profileItems, setProfileItems] = useState<ProfileItem[]>([])
  const [familyMembers, setFamilyMembers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.role === 'admin'
  const canEditBaby = user?.role === 'admin' || user?.role === 'parent'

  useEffect(() => {
    async function load() {
      try {
        const [babyData, items, members] = await Promise.all([
          getBabyProfile(),
          getProfileItems(user?.id ?? 'user-1'),
          isAdmin ? getFamilyMembers() : Promise.resolve([]),
        ])
        setBaby(babyData)
        setProfileItems(items)
        setFamilyMembers(members)
      } catch (err) {
        console.error('Failed to load profile data', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAdmin])

  const handleUpdateProfileItem = async (id: string, content: string) => {
    await updateProfileItem(id, content)
    setProfileItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, content } : item))
    )
  }

  const handleDeleteProfileItem = async (id: string) => {
    await deleteProfileItem(id)
    setProfileItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleUpdateBaby = async (updates: Partial<BabyProfile>) => {
    if (!baby) return
    const updated = { ...baby, ...updates }
    await updateBabyProfile(updated)
    setBaby(updated)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-fawn-amber border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8 overflow-y-auto">
      <h1 className="text-[20px] font-semibold text-soft-charcoal">我的</h1>

      {/* Section 1: User Info */}
      {user && (
        <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
          <div className="flex items-center gap-4 mb-4">
            {/* Avatar */}
            <div className="flex-shrink-0 relative">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-16 h-16 rounded-full object-cover"
                  style={{ border: `2px solid ${ROLE_COLORS[user.role] ?? '#D4956A'}` }}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-[18px] font-semibold"
                  style={{
                    backgroundColor: ROLE_COLORS[user.role] ?? '#D4956A',
                    border: `2px solid ${ROLE_COLORS[user.role] ?? '#D4956A'}`,
                  }}
                >
                  {getInitials(user.name)}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-[20px] font-semibold text-soft-charcoal">{user.name}</h2>
              <span
                className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[12px] font-medium text-white"
                style={{ backgroundColor: ROLE_COLORS[user.role] ?? '#D4956A' }}
              >
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </div>
          </div>

          {/* Profile Items */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <User size={14} className="text-mid-gray" />
              <p className="text-[13px] text-mid-gray font-medium">AI 已了解的信息</p>
            </div>

            {profileItems.length === 0 ? (
              <p className="text-[13px] text-mid-gray py-2">
                暂无记录。开始对话后，AI 会自动归纳你的画像信息。
              </p>
            ) : (
              <div>
                {profileItems.map((item) => (
                  <EditableProfileItem
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdateProfileItem}
                    onDelete={handleDeleteProfileItem}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 2: Baby Profile */}
      {baby && (
        <BabyProfileCard
          baby={baby}
          canEdit={canEditBaby}
          onUpdate={handleUpdateBaby}
        />
      )}

      {/* Section 3: Family Members (admin only) */}
      {isAdmin && (
        <div className="bg-white border border-oat-border rounded-card shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-fawn-amber" />
              <h3 className="text-[17px] font-semibold text-soft-charcoal">家庭成员</h3>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-btn bg-[#F2DFD0] active:opacity-80 transition-opacity">
              <Plus size={14} className="text-fawn-amber" />
              <span className="text-[13px] font-medium text-fawn-amber">添加成员</span>
            </button>
          </div>

          <div className="space-y-1">
            {familyMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 py-2.5 border-b border-oat-border last:border-0"
              >
                {/* Avatar */}
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    style={{ border: `2px solid ${ROLE_COLORS[member.role] ?? '#D4956A'}` }}
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: ROLE_COLORS[member.role] ?? '#D4956A',
                      border: `2px solid ${ROLE_COLORS[member.role] ?? '#D4956A'}`,
                    }}
                  >
                    {getInitials(member.name)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-soft-charcoal">{member.name}</p>
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white mt-0.5"
                    style={{ backgroundColor: ROLE_COLORS[member.role] ?? '#8E8E93' }}
                  >
                    {ROLE_LABELS[member.role] ?? member.role}
                  </span>
                </div>

                {/* Remove button (not shown for current user) */}
                {member.id !== user?.id && (
                  <button
                    className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[#FDEEEB] transition-colors"
                    aria-label={`移除 ${member.name}`}
                  >
                    <Trash2 size={16} className="text-mid-gray" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Settings */}
      <div className="bg-white border border-oat-border rounded-card shadow-card overflow-hidden">
        <div className="flex items-center gap-2 p-4 pb-3">
          <Settings size={16} className="text-fawn-amber" />
          <h3 className="text-[17px] font-semibold text-soft-charcoal">设置</h3>
        </div>

        {/* LLM Provider info */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-oat-border">
          <div>
            <p className="text-[15px] text-soft-charcoal">AI 提供商</p>
            <p className="text-[12px] text-mid-gray mt-0.5">由系统管理员配置</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-dark-gray">Claude</span>
            <ChevronRight size={16} className="text-mid-gray" />
          </div>
        </div>

        {/* About */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-oat-border">
          <p className="text-[15px] text-soft-charcoal">关于 Fawn</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] text-dark-gray">v0.1.0</span>
            <ChevronRight size={16} className="text-mid-gray" />
          </div>
        </div>

        {/* Logout */}
        <div className="px-4 py-4 border-t border-oat-border">
          <button
            onClick={logout}
            className="w-full py-3 rounded-btn bg-[#E25B45] text-white text-[16px] font-semibold active:opacity-85 transition-opacity"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/app/(main)/profile/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/(main)/profile/page.tsx frontend/src/app/(main)/profile/page.test.tsx
git commit -m "feat(frontend): add profile page with user info, baby profile, family members, and settings"
```

---

### Task 15: Final Verification & Smoke Test

**Files:**
- No new files

- [ ] **Step 1: Run full lint**

Run: `cd frontend && npm run lint`
Expected: No lint errors.

- [ ] **Step 2: Run full test suite**

Run: `cd frontend && npm run test`
Expected: All tests pass.

- [ ] **Step 3: Run production build**

Run: `cd frontend && npm run build`
Expected: Build completes with no errors.

- [ ] **Step 4: Start dev server and smoke test**

Run: `cd frontend && npm run dev`

Manual verification checklist:
1. Open http://localhost:3000 → redirects to /login
2. Login with mama/password123 → redirects to /chat
3. /chat page: messages render, input works, send button works, attach button visible, quick action chips visible
4. /chat page: no TabBar visible (only input bar at bottom)
5. Navigate to /dashboard via TabBar on another page → growth chart renders, feeding/sleep stats show data
6. Navigate to /album → photos render in grid, click photo opens viewer, upload button visible
7. Navigate to /profile → user info renders, baby profile card, family members (admin), logout button
8. Click a history conversation → navigates to /chat?conversationId=xxx, loads correct messages
9. Verify all pages have correct warm-cream background (#FFF9F4), fawn-amber accents (#D4956A)
10. Verify mobile viewport (375px width in Chrome DevTools)

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "$(cat <<'COMMITEOF'
chore(frontend): final verification pass

All lint, test, and build checks pass.
Manual smoke test completed on dev server.

Constraint: mock API only, no backend integration
Tested: lint, vitest full suite, next build, manual smoke (10-point checklist)
Not-tested: real API integration, e2e with Playwright, iOS Safari

Co-Authored-By: Claude Opus 4 <noreply@anthropic.com>
COMMITEOF
)"
```
