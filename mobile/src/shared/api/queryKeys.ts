// Centralised TanStack Query key factory.
//
// Keep all query keys in this file so persisted cache entries are stable across
// the app and so feature code can invalidate slices without hand-rolling the
// key shape.

export const queryKeys = {
  baby: {
    all: ['baby'] as const,
    detail: () => [...queryKeys.baby.all, 'detail'] as const,
  },
  chat: {
    all: ['chat'] as const,
    conversations: () => [...queryKeys.chat.all, 'conversations'] as const,
    conversation: (id: string) => [...queryKeys.chat.all, 'conversation', id] as const,
    history: (pageSize: number) =>
      [...queryKeys.chat.all, 'history', { pageSize }] as const,
  },
  growth: {
    all: ['growth'] as const,
    records: () => [...queryKeys.growth.all, 'records'] as const,
    chart: () => [...queryKeys.growth.all, 'chart'] as const,
    latest: () => [...queryKeys.growth.all, 'latest'] as const,
  },
  records: {
    all: ['records'] as const,
    timeline: () => [...queryKeys.records.all, 'timeline'] as const,
  },
  agentTasks: {
    all: ['agentTasks'] as const,
    definitions: () => [...queryKeys.agentTasks.all, 'definitions'] as const,
    run: (id: string) => [...queryKeys.agentTasks.all, 'run', id] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    summary: () => [...queryKeys.dashboard.all, 'summary'] as const,
    feedingStats: (days: number) =>
      [...queryKeys.dashboard.all, 'feeding-stats', { days }] as const,
    sleepStats: (days: number) =>
      [...queryKeys.dashboard.all, 'sleep-stats', { days }] as const,
    health: () => [...queryKeys.dashboard.all, 'health'] as const,
  },
  album: {
    all: ['album'] as const,
    photos: (view: string) => [...queryKeys.album.all, 'photos', view] as const,
  },
} as const;
