# Findings & Decisions

## Requirements

- Use the Figma file `fawn` as the visual reference for the current Fawn frontend.
- Preserve existing behavior, auth, permissions, chat streaming, album upload/viewer, profile management, and API data flow.
- Apply a visual-first redesign with light layout changes, not a full information-architecture rewrite.
- Keep Chinese product copy; Figma English copy is reference-only.
- Add a new independent `/record` tab labeled `记录`.
- Make `/record` actually create tracker records for feeding, sleep, growth, and health.
- Do not show or model diaper/tummy-time in this round.
- Shift `/dashboard` toward trends, summaries, and recent record summaries rather than full JSON-style record management.

## Research Findings

- Frontend stack: Next 15, React 19, Tailwind, Zustand, Vitest, Testing Library.
- Current main routes include `/chat`, `/dashboard`, `/album`, `/profile`, and `/history`.
- Current bottom navigation has four tabs: 对话, 数据, 相册, 我的.
- Figma file `fawn` contains main frames:
  - `AI 育儿管家 (聊天)` node `1:2`
  - `宝宝成长记录板` node `1:126`
  - `智慧相册` node `1:278`
  - `快捷记录中心` node `1:387`
  - `家庭与隐私设置` node `1:522`
  - `AI 育儿管家 (优化布局)` node `1:658`
- `/chat` should use node `1:658`, not the older chat frame.
- Backend tracker service already has create functions for growth, feeding, sleep, and health.
- Backend tracker API currently exposes list, patch, and delete endpoints, but not public POST endpoints.
- Frontend API client currently has read/update/delete tracker methods, but no create methods.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Implement backend POST endpoints before `/record` UI | `/record` must be truly functional, and existing service functions make this bounded. |
| Use existing tracker models only | Avoids data model expansion during a UI-focused redesign. |
| Update shared tokens/components before page passes | Keeps Figma visual language reusable and reduces page-local style drift. |
| Keep dashboard record editing out of scope | User selected recent summary only; full management can be revisited later. |
| Use route-local compact panels for `/record` unless implementation evidence suggests a modal is better | Fits mobile page flow and avoids introducing fragile overlay behavior too early. |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Official Figma browser page returned CloudFront 403 in browser automation | Installed/configured `figma-developer-mcp` and used Figma API token to read file data. |
| Current Codex session did not dynamically expose newly registered Figma MCP tools | Used `figma-developer-mcp fetch` CLI for current-session verification. |
| `writing-plans` skill was referenced by brainstorming instructions but not installed | Used `planning-with-files` fallback and documented this in `task_plan.md`. |

## Resources

- Design spec: `docs/superpowers/specs/2026-05-02-figma-ui-redesign-design.md`
- Frontend package: `frontend/package.json`
- Frontend theme: `frontend/src/app/globals.css`, `frontend/tailwind.config.ts`
- Main layout/nav: `frontend/src/app/(main)/layout.tsx`, `frontend/src/components/layout/TabBar.tsx`, `frontend/src/components/layout/TopBar.tsx`
- Tracker backend API: `backend/src/fawn/api/tracker.py`
- Tracker backend schemas: `backend/src/fawn/api/schemas.py`
- Tracker backend services: `backend/src/fawn/services/tracker.py`
- Frontend API client/types: `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`

## Visual/Browser Findings

- Figma visual direction uses a 390px mobile frame width, soft white/blue background, mint active states, warm yellow cards, large rounded cards, glassy top/bottom bars, and soft shadows.
- `快捷记录中心` Figma frame has a 5-tab bottom nav with the center record/log tab active, Bento entry grid, timer section, and visual context card.
- `宝宝成长记录板` frame emphasizes AI summary card, quick stats, growth chart card, detail card, and album hint.
- `智慧相册` frame emphasizes AI insight banner, category grid, evaluation spotlight, and recent feed.
- `家庭与隐私设置` frame emphasizes family member management, data/privacy Bento cards, and settings sections.

---

*Update this file after every 2 view/browser/search operations.*
