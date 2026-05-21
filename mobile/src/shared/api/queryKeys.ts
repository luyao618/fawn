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
    messages: (
      id: string,
      target?: {
        targetMessageId?: string | null;
        targetDate?: string | null;
        aroundLimit?: number;
      },
    ) =>
      target?.targetMessageId || target?.targetDate
        ? [...queryKeys.chat.all, 'messages', id, target] as const
        : [...queryKeys.chat.all, 'messages', id] as const,
    targetWindow: (id: string, targetMessageId: string, aroundLimit: number) =>
      [
        ...queryKeys.chat.all,
        'messages',
        id,
        { targetMessageId, aroundLimit },
      ] as const,
    historyRoot: () => [...queryKeys.chat.all, 'history'] as const,
    history: (pageSize: number) =>
      [...queryKeys.chat.historyRoot(), { pageSize }] as const,
    search: (query: string, pageSize: number) =>
      [
        ...queryKeys.chat.all,
        'search',
        { query: query.trim(), pageSize },
      ] as const,
    monthActivity: (year: number, month: number) =>
      [...queryKeys.chat.all, 'activity', { year, month }] as const,
    dayTarget: (date: string) =>
      [...queryKeys.chat.all, 'day-target', { date }] as const,
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
  tracker: {
    all: ['tracker'] as const,
    feeding: () => [...queryKeys.tracker.all, 'feeding'] as const,
    sleep: () => [...queryKeys.tracker.all, 'sleep'] as const,
    health: () => [...queryKeys.tracker.all, 'health'] as const,
  },
  album: {
    all: ['album'] as const,
    photos: (view: string) => [...queryKeys.album.all, 'photos', view] as const,
  },
} as const;
