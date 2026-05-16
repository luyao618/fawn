// Agent task (用户可触发任务) API + TanStack Query bindings.
//
// Mirrors backend/src/fawn/api/agent_tasks.py and the schemas in
// backend/src/fawn/api/schemas.py. The backend exposes three endpoints we
// care about for v1:
//   GET  /agent-tasks/definitions       — list runnable tasks
//   POST /agent-tasks/{name}/runs       — trigger a run
//   GET  /agent-tasks/runs/{id}         — fetch a single run (polled)
// A fourth `GET /agent-tasks/runs` lists history but the RN module shown to
// users only needs the first three for the v1 UX (列表 / 触发 / 运行详情三态).

import { isAxiosError } from 'axios';

import { api } from './client';
import { queryKeys } from './queryKeys';

export type AgentTaskRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface AgentTaskDefinition {
  name: string;
  title: string;
  description: string;
  input_schema: Record<string, unknown>;
  estimated_duration_seconds: number;
  enabled: boolean;
}

export interface AgentTaskRunError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AgentTaskRun {
  id: string;
  name: string;
  status: AgentTaskRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: AgentTaskRunError | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

interface DefinitionsResponse {
  definitions: AgentTaskDefinition[];
}

async function fetchDefinitions(): Promise<AgentTaskDefinition[]> {
  const { data } = await api.get<DefinitionsResponse>('/agent-tasks/definitions');
  return data.definitions;
}

async function fetchRun(id: string): Promise<AgentTaskRun> {
  const { data } = await api.get<AgentTaskRun>(`/agent-tasks/runs/${id}`);
  return data;
}

/**
 * Trigger a task. The backend may respond 409 `task_run_in_progress` when an
 * in-flight run for this family already exists — in that case it includes the
 * existing run id in the error detail, which we surface as `existingRunId` so
 * the UI can switch to following that run instead of treating it as a hard
 * failure.
 */
export class TaskTriggerError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly existingRunId: string | null;
  readonly httpStatus: number;

  constructor(opts: {
    code: string;
    message: string;
    retryable: boolean;
    existingRunId: string | null;
    httpStatus: number;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.retryable = opts.retryable;
    this.existingRunId = opts.existingRunId;
    this.httpStatus = opts.httpStatus;
  }
}

export async function triggerRun(
  name: string,
  input: Record<string, unknown> = {},
): Promise<AgentTaskRun> {
  try {
    const { data } = await api.post<AgentTaskRun>(
      `/agent-tasks/${encodeURIComponent(name)}/runs`,
      { input },
    );
    return data;
  } catch (err) {
    if (isAxiosError(err) && err.response) {
      const status = err.response.status;
      const detail = (err.response.data as { detail?: unknown } | undefined)?.detail;
      if (detail && typeof detail === 'object') {
        const d = detail as Record<string, unknown>;
        const code = typeof d.code === 'string' ? d.code : `http_${status}`;
        const message =
          typeof d.message === 'string' ? d.message : err.message || '触发失败';
        const retryable = typeof d.retryable === 'boolean' ? d.retryable : status >= 500;
        const existingRunId =
          typeof d.existing_run_id === 'string' ? d.existing_run_id : null;
        throw new TaskTriggerError({
          code,
          message,
          retryable,
          existingRunId,
          httpStatus: status,
        });
      }
      throw new TaskTriggerError({
        code: `http_${status}`,
        message: err.message || '触发失败',
        retryable: status >= 500,
        existingRunId: null,
        httpStatus: status,
      });
    }
    throw err;
  }
}

export const agentTaskQueries = {
  definitions: () => ({
    queryKey: queryKeys.agentTasks.definitions(),
    queryFn: fetchDefinitions,
  }),
  run: (id: string) => ({
    queryKey: queryKeys.agentTasks.run(id),
    queryFn: () => fetchRun(id),
  }),
};
