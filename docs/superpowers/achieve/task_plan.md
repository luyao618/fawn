# Task Plan: Fawn Figma UI Redesign Implementation

## Goal

Implement the approved Figma-inspired Fawn frontend redesign while preserving current behavior, adding a real `/record` tab, and keeping tracker model scope limited to feeding, sleep, growth, and health.

## Current Phase

Complete

## Phases

### Phase 1: Implementation Plan Setup

- [x] Capture approved design specification as implementation context
- [x] Create persistent planning files
- [x] Record key requirements and constraints
- **Status:** complete

### Phase 2: Tracker Create API Foundation

- [x] Add backend create request schemas for growth, feeding, sleep, and health
- [x] Add `POST /tracker/growth`, `/tracker/feeding`, `/tracker/sleep`, `/tracker/health`
- [x] Reuse existing tracker service create functions and `require_tracker_writer`
- [x] Add backend API tests for success, permission failure, and invalid payloads
- **Status:** complete

### Phase 3: Frontend Data Layer

- [x] Add typed frontend create payloads and API client methods
- [x] Add mock-mode create behavior for four supported record types
- [x] Ensure dashboard refresh/re-entry reflects mock-created records
- **Status:** complete

### Phase 4: Visual System and Shared Shell

- [x] Update global CSS variables and Tailwind tokens from the Figma direction
- [x] Refresh shared primitives: Card, Button, Avatar, segmented controls where applicable
- [x] Refresh `TopBar` and `TabBar` into the five-tab Figma-inspired shell
- [x] Preserve mobile shell, safe-area handling, tap targets, and auth guard behavior
- **Status:** complete

### Phase 5: `/record` Page

- [x] Add `/record` route
- [x] Build four Bento quick-record cards: 喂养, 睡眠, 生长, 健康
- [x] Build compact forms and success/error states
- [x] Respect `canWriteTracker` and server permissions
- [x] Add frontend tests for tab navigation and record submission
- **Status:** complete

### Phase 6: Page Redesign Passes

- [x] Redesign `/dashboard` as trends/summary with recent record summary and `/record` entry
- [x] Redesign `/chat` using `AI 育儿管家 (优化布局)` as primary reference
- [x] Redesign `/album` with insight banner, softer mode controls, and photo-card polish
- [x] Redesign `/profile` around family/privacy sections
- [x] Keep existing behavior and update tests where labels/layout change
- **Status:** complete

### Phase 7: Verification and Visual QA

- [x] Run backend tests
- [x] Run frontend typecheck, tests, and build
- [x] Start frontend locally in mock mode if needed for screenshots
- [x] Check mobile widths around 390px and 360px for overflow, overlap, and safe-area issues
- [x] Fix regressions found during verification
- **Status:** complete

### Phase 8: Delivery

- [x] Summarize changed files and simplifications
- [x] Report verification evidence and remaining risks
- [x] Ensure no sensitive local files are tracked
- **Status:** complete

## Key Questions

1. Do backend tests already have fixture helpers for tracker API auth/permissions, or should new tests follow service-level patterns?
2. Should `/record` forms be inline panels, modal sheets, or route-local expanded cards? Default to route-local compact panels unless existing UX suggests otherwise.
3. Which visual checks are available locally: screenshots through browser automation, static build only, or manual browser inspection?

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Use approach B: visual-first redesign with light layout changes | Matches user intent: Figma is preferred UI direction, but frontend architecture should not be rewritten. |
| Use `AI 育儿管家 (优化布局)` for `/chat` | User selected the optimized layout as the primary chat reference. |
| Add independent `/record` tab named `记录` | User selected an independent page and chose the label `记录`. |
| Keep product copy Chinese | Current app is Chinese; Figma English copy is treated as generated placeholder content. |
| Make `/record` fully functional | User selected real record creation over a shell or chat handoff. |
| Limit `/record` to feeding, sleep, growth, health | User selected avoiding new diaper/tummy-time models in this round. |
| Change dashboard to trends/summary plus recent records | User selected removing full record management from dashboard. |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| Missing `writing-plans` skill | 1 | Used available `planning-with-files` skill as the closest implementation planning fallback. |
| `ls task_plan.md findings.md progress.md` failed because files did not exist | 1 | Created new planning files in the project root. |
| `uv run pytest backend/tests/test_api/test_tracker.py` from repo root did not start correctly | 1 | Re-ran from the backend project directory as `uv run pytest tests/test_api/test_tracker.py`. |

## Notes

- Approved design spec: `docs/superpowers/specs/2026-05-02-figma-ui-redesign-design.md`
- Figma file key: `K02dLT9hfPg89Pf1W0daZg`
- Sensitive/local files are ignored: `.figma.env`, `.figma-assets/`, `.superpowers/`
