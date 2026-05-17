// Dashboard data queries — mirror the `/dashboard/*` endpoints consumed by the
// Web Dashboard. The mobile Dashboard screen composes all four resources so
// keep these in a single module to make invalidation straightforward.

import { api } from './client';
import { queryKeys } from './queryKeys';
import type {
  DashboardSummary,
  FeedingStatsData,
  HealthRecord,
  SleepStatsData,
} from './types';

async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary');
  return data;
}

async function fetchFeedingStats(days = 30): Promise<FeedingStatsData> {
  const { data } = await api.get<FeedingStatsData>('/dashboard/feeding-stats', {
    params: { days },
  });
  return data;
}

async function fetchSleepStats(days = 30): Promise<SleepStatsData> {
  const { data } = await api.get<SleepStatsData>('/dashboard/sleep-stats', {
    params: { days },
  });
  return data;
}

async function fetchHealthRecords(): Promise<HealthRecord[]> {
  const { data } = await api.get<HealthRecord[]>('/tracker/health');
  return data;
}

export const dashboardQueries = {
  summary: () => ({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: fetchDashboardSummary,
  }),
  feedingStats: (days = 30) => ({
    queryKey: queryKeys.dashboard.feedingStats(days),
    queryFn: () => fetchFeedingStats(days),
  }),
  sleepStats: (days = 30) => ({
    queryKey: queryKeys.dashboard.sleepStats(days),
    queryFn: () => fetchSleepStats(days),
  }),
  health: () => ({
    queryKey: queryKeys.dashboard.health(),
    queryFn: fetchHealthRecords,
  }),
};
