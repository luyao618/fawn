# Agent Short-Term Memory Design

## Background

Fawn currently treats LangGraph checkpoint as the main short-term memory mechanism. That is not enough for product behavior. The poor sleep-recording flow exposed two separate gaps:

- Ordinary conversation needs recent context so the assistant can understand follow-up messages, references, corrections, and short replies.
- Structured business tasks need explicit task state so the backend can know what is being completed, corrected, confirmed, cancelled, or expired.

The deterministic tracker route added before this design improved tool routing, but it only looked at the current user message. That made multi-turn replies like "差不多，醒1次" or "不是，晚8点到凌晨3点" unreliable.

This design defines Fawn's product-level short-term memory as two layers:

1. Recent conversation memory, loaded from the message archive every turn.
2. Structured working memory, stored as active `agent_tasks`.

LangGraph checkpoint remains useful as graph runtime state, but it is no longer the only or primary product memory contract.

## Goals

- Make the assistant remember at least the recent 10 turns of ordinary conversation.
- Support multi-turn tracker and baby profile tasks with explicit structured state.
- Keep family chat semantics: the family shares one conversation window and one active pending task.
- Preserve safe permissions: friends can read/query/chat, but cannot create, supplement, or confirm write tasks.
- Make ambiguous corrections intelligent but bounded: find likely candidates, then ask for confirmation before modifying existing data.
- Keep implementation incremental and testable.

## Non-Goals

- Do not replace LangGraph completely in the first implementation.
- Do not build a full long-term semantic memory system in this phase.
- Do not support multiple active tasks per family in the first implementation.
- Do not connect album or family-member management tasks yet.
- Do not let the model decide permissions or write safety rules.

## Architecture

The assistant memory stack has four layers.

### `messages`

`messages` remains the permanent conversation archive and the source of truth for recent context. It is used for chat history, search, audit, and context reconstruction.

It does not store current business task state.

### `ShortTermContextBuilder`

`ShortTermContextBuilder` builds recent conversation memory for every chat request. It reads the current conversation's recent messages and formats them as compact model context.

The same recent context is passed to both deterministic task orchestration and the LangGraph fallback path.

### `agent_tasks`

`agent_tasks` stores structured working memory. It represents one currently active business task, such as completing a sleep record or updating baby profile fields.

It stores machine-readable slots, missing fields, status, risk level, initiating user, updating user, confirming user, expiry time, and completion time.

### Orchestrator

The task orchestrator is the deterministic decision layer. It reads:

- current user message
- recent context
- active family task
- current user permissions
- family and baby state

It decides whether the user is continuing an active task, correcting recent data, starting a new tracker/profile task, querying data, or falling back to ordinary chat.

LLMs may be used for structured understanding, but backend code makes final decisions about permissions, risk, writes, expiry, and confirmation.

### LangGraph

LangGraph remains responsible for ordinary assistant chat, open-ended advice, knowledge search, album browsing, and other non-structured flows.

LangGraph still uses `thread_id = conversation_id` in the first phase. Recent context is explicitly supplied as well, so product behavior does not depend only on checkpoint state.

## Recent Conversation Memory

Every chat request should load recent context from `messages`.

Default policy:

- Load the latest 10 user-assistant turns, up to 20 messages.
- Exclude the just-saved current user message to avoid duplication.
- Include absolute timestamp and relative timestamp.
- Include speaker display name when available.
- Include access type and role label when available.
- Summarize image messages as text, for example "用户上传了一张照片".
- Truncate long assistant responses to a fixed budget, such as 500 to 800 Chinese characters.
- Do not include raw binary image content.

Suggested model format:

```text
<recent-context>
[2026-05-04 20:15 | 3分钟前 | 妈妈/父母 | 角色: 妈妈] 昨晚睡眠7个小时
[2026-05-04 20:16 | 2分钟前 | 管家] 大概几点到几点？夜醒几次？
[2026-05-04 20:17 | 1分钟前 | 妈妈/父母 | 角色: 妈妈] 差不多，醒1次
</recent-context>

当前用户消息：
不是，晚8点到凌晨3点
```

Timestamps are required because Fawn's domain heavily depends on relative time expressions such as "刚刚", "昨晚", "今天早上", and "凌晨3点".

The backend still computes expiry and time normalization deterministically. The model receives timestamps for language understanding, not for authority over state.

## Structured Working Memory

Add an `agent_tasks` table as the source of truth for active business tasks.

Suggested fields:

```text
id
family_id
conversation_id
task_type
status
payload
missing_slots
risk_level
initiated_by_user_id
last_updated_by_user_id
confirmed_by_user_id
expires_at
completed_at
created_at
updated_at
```

Recommended enums:

```text
task_type:
  tracker_create
  tracker_update
  tracker_delete
  baby_profile_update

status:
  pending
  awaiting_confirmation
  completed
  cancelled
  expired

risk_level:
  low
  medium
  high
```

First implementation constraints:

- A family can have at most one active task.
- Active means `pending` or `awaiting_confirmation` and `expires_at > now`.
- The active task expires after 1 hour.
- Expired tasks are not resumed by short replies like "确认" or "可以".
- Family members share the active task.
- The task records initiating user and final confirming user.

Example payload:

```json
{
  "domain": "tracker",
  "action": "create",
  "record_type": "sleep",
  "slots": {
    "duration_hours": 7,
    "night_wakings": 1,
    "sleep_start": "2026-05-03T20:00:00+08:00",
    "sleep_end": "2026-05-04T03:00:00+08:00",
    "sleep_type": "night"
  },
  "requires_confirmation_reason": "cross_day_sleep"
}
```

## Task State Machine

```text
pending
  -> pending
  -> awaiting_confirmation
  -> completed
  -> cancelled
  -> expired

awaiting_confirmation
  -> completed
  -> pending
  -> cancelled
  -> expired
```

State behavior:

- `pending` means the task is known but still missing slots or disambiguation.
- `awaiting_confirmation` means all required information is available, but the task cannot write until a permitted user confirms.
- `completed` means the service call succeeded or the query was answered.
- `cancelled` means the user said "算了", "先别记", "取消", or equivalent.
- `expired` means the active window elapsed.

When a task is updated, update `last_updated_by_user_id` and extend `expires_at` by 1 hour from the latest valid user interaction.

## Risk and Confirmation Rules

Low-risk complete records can be written directly. Higher-risk actions require confirmation.

Direct write examples:

- Complete feeding record with explicit amount and type.
- Complete low-risk baby profile field update, such as nickname or notes.

Confirmation required:

- Cross-day sleep.
- Ambiguous time ranges.
- Any correction to an existing record.
- Any tracker update or delete.
- Health events.
- Baby profile high-risk fields such as birthday, sex, birth measurements, or other fields that affect age/growth interpretation.

No existing data should be modified or deleted without confirmation.

## Permissions

The active family task is shared, but write authority is not.

Permission rules:

- Parent and family users can create, supplement, and confirm write tasks if their access allows tracker/profile writes.
- Friends can query and chat.
- Friends cannot create write tasks.
- Friends cannot supplement write tasks.
- Friends cannot confirm write tasks.
- If a friend replies to a write-task clarification, the assistant should explain that a parent or family member needs to provide or confirm the information.

The backend enforces these rules. The model may classify intent, but it does not grant permission.

## Orchestrator Decision Order

Every chat request follows a fixed order:

1. Save the current user message.
2. Load recent context.
3. Load the active family task.
4. If the user is a friend, block write-task creation, supplementation, and confirmation.
5. If an active task exists:
   - classify the current message as supplement, correction, confirmation, cancellation, or topic switch
   - merge slots when appropriate
   - ask the smallest next clarification if data is still missing
   - move to `awaiting_confirmation` when required
   - execute and complete the task when safe
6. If no active task exists:
   - detect bounded correction intent
   - search recent context and recent business records for likely candidates
   - if exactly one high-confidence candidate exists, create an `awaiting_confirmation` task
   - if candidates are ambiguous, ask the user to choose
7. Detect new tracker or baby profile task:
   - direct-write low-risk complete tasks
   - create `pending` tasks for missing slots
   - create `awaiting_confirmation` tasks for high-risk complete tasks
8. Fall back to LangGraph ordinary chat with recent context.

## Sleep Example

Expected flow:

```text
用户：昨晚睡眠7个小时
系统：create pending sleep task; missing start/end/night_wakings
管家：大概几点到几点？夜醒几次？

用户：差不多，醒1次
系统：merge night_wakings=1; still missing start/end
管家：大概几点睡到几点醒？

用户：8点到3点
系统：recent context says this is last night's sleep; normalize 20:00 -> 03:00
系统：cross-day sleep requires confirmation
管家：我理解为昨晚20:00到今天03:00，夜醒1次，确认记录吗？

用户：确认
系统：create sleep record; complete task
```

If the user says "不是，晚8点到凌晨3点", it is treated as a correction to the active sleep task, not as a request to list existing sleep records.

## Bounded Correction Without Active Task

When no active task exists, correction-like messages can still be useful:

```text
用户：不对，是90ml
```

The orchestrator may search recent context and recent business records. If it finds one likely feeding record, it creates an `awaiting_confirmation` task:

```text
我理解你是想把刚才那条喂养记录改成90ml，确认吗？
```

If there are multiple candidates, the assistant asks the user to choose. It must not silently update an existing record.

## Baby Profile Tasks

First implementation supports baby profile update tasks alongside tracker tasks.

Low-risk complete updates may write directly:

- nickname
- notes
- non-critical display fields

High-risk updates require confirmation:

- birthday
- sex
- birth weight
- birth length
- birth head circumference
- any field used for age, growth, or health interpretation

Profile writes should reuse existing service-layer permission checks. If service-layer permission is not yet explicit enough, implementation should add backend checks before exposing chat-driven writes.

## LangGraph Checkpoint Coexistence

The first implementation keeps LangGraph checkpoint enabled.

Rules:

- Product recent memory always comes from `messages`.
- Structured task memory always comes from `agent_tasks`.
- LangGraph checkpoint remains graph runtime state.
- Every ordinary LangGraph call receives recent context explicitly.
- Do not remove checkpoint in this phase.

If duplicate context causes poor output later, a second phase can simplify LangGraph into a more stateless per-turn call using system prompt, recent context, and current message.

## Phased Implementation Plan

### Phase 1: Short-Term Memory Infrastructure

- Add `ShortTermContextBuilder`.
- Add `agent_tasks` model, migration, schema exports, and service helpers.
- Load recent context and active task in chat route.
- Pass recent context to deterministic orchestration and LangGraph fallback.
- Preserve existing chat streaming behavior.

### Phase 2: Task Orchestration

- Connect tracker create/query/update/delete to the task framework.
- Connect baby profile update to the task framework.
- Implement risk-based confirmation.
- Implement bounded correction without active task.
- Enforce friend write restrictions.

## Test Strategy

Required regression coverage:

- Recent context is built from the last 10 turns and includes timestamps.
- Ordinary chat fallback receives recent context.
- Sleep multi-turn flow records one night sleep from 20:00 to 03:00 with one night waking after confirmation.
- Active-task correction updates the pending task instead of searching unrelated existing records.
- No-active-task correction creates an awaiting-confirmation update task and does not silently modify data.
- Friend write attempts are rejected and do not create write tasks.
- Expired tasks cannot be completed by "确认".
- Baby profile low-risk update can write directly when complete.
- Baby profile high-risk update requires confirmation.
- Existing backend tracker and chat tests remain passing.

## Decisions Captured

- Use a real `agent_tasks` table, not only message metadata.
- One active task per family in the first version.
- Active tasks expire after 1 hour.
- Family members share the task, but the task records initiator, last updater, and confirmer.
- Friends can query/chat but cannot participate in write tasks.
- Initial task domains are tracker and baby profile.
- Confirmation is risk-based.
- Bounded correction is allowed, but modifying existing data always requires confirmation.

## Remaining Risks

- Supplying recent context while LangGraph checkpoint also contains messages may cause duplicate context. This is accepted for phase 1 and should be monitored.
- Time normalization for informal phrases needs careful tests around midnight, "昨晚", and "凌晨".
- Baby profile write permissions may need tightening in the service layer before chat-driven updates are enabled.
- One active task per family is simple but may interrupt parallel family conversations. This is intentional for the first version.
