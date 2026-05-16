// Deep-link bus — a tiny pub/sub for routing notification taps into the
// in-app navigation tree.
//
// Why not React Navigation? The v1 app uses local component state for
// routing (App.tsx -> HomeScreen tabs), so a navigation library would be
// overkill. Instead we publish a structured intent here and have the
// relevant screens subscribe and pull it from a "pending" slot.
//
// The "pending" slot solves a real race: a push tap that cold-starts the
// app fires before the screens that handle it have mounted. We hold the
// intent until the first matching subscriber claims it.

export type DeepLinkIntent =
  | { kind: 'agent_task_run'; runId: string; taskName?: string }
  | { kind: 'unknown'; raw: Record<string, unknown> };

type Listener = (intent: DeepLinkIntent) => boolean | void;

let pending: DeepLinkIntent | null = null;
const listeners = new Set<Listener>();

/**
 * Publish an intent. If any listener returns true ("I handled it"), we
 * consider it consumed; otherwise it sits in `pending` until a matching
 * subscriber drains it via {@link takePendingIntent}.
 */
export function publishIntent(intent: DeepLinkIntent): void {
  for (const listener of listeners) {
    const handled = listener(intent);
    if (handled) return;
  }
  pending = intent;
}

/**
 * Subscribe to future intents. Returns an unsubscribe fn.
 */
export function subscribeIntents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Drain whatever intent is pending (if any). The caller takes ownership —
 * subsequent calls return null until a new intent is published. Used by
 * screens that mount after a cold-start push to pick up the missed intent.
 */
export function takePendingIntent(): DeepLinkIntent | null {
  const out = pending;
  pending = null;
  return out;
}

/**
 * Map a raw Expo notification `data` payload (matches backend
 * `_dispatch_terminal_push`) to a typed intent. Unknown shapes degrade to
 * `kind: 'unknown'` so callers can log/ignore without crashing.
 */
export function intentFromPushData(
  data: Record<string, unknown> | undefined | null,
): DeepLinkIntent | null {
  if (!data) return null;
  const kind = typeof data.kind === 'string' ? data.kind : null;
  if (kind === 'agent_task_completed' || kind === 'agent_task_failed') {
    const runId = typeof data.run_id === 'string' ? data.run_id : null;
    if (!runId) return null;
    const taskName = typeof data.task_name === 'string' ? data.task_name : undefined;
    return { kind: 'agent_task_run', runId, taskName };
  }
  return { kind: 'unknown', raw: data };
}

/** Test-only: drop all subscribers + the pending slot. */
export function _resetForTests(): void {
  pending = null;
  listeners.clear();
}
