// Dashboard data queries — mirror the `/dashboard/*` endpoints consumed by the
// Web Dashboard. The mobile Dashboard screen composes all four resources so
// keep these in a single module to make invalidation straightforward.

import { api } from './client';
import { queryKeys } from './queryKeys';
import type {
  DashboardSummary,
  DiaperRecord,
  DiaperStatsData,
  FeedingRecord,
  FeedingStatsData,
  HealthRecord,
  SleepRecord,
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

async function fetchDiaperStats(days = 30): Promise<DiaperStatsData> {
  const { data } = await api.get<DiaperStatsData>('/dashboard/diaper-stats', {
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
  diaperStats: (days = 30) => ({
    queryKey: queryKeys.dashboard.diaperStats(days),
    queryFn: () => fetchDiaperStats(days),
  }),
  health: () => ({
    queryKey: queryKeys.dashboard.health(),
    queryFn: fetchHealthRecords,
  }),
};

// ---------------------------------------------------------------------------
// Tracker record list queries — feed the TrackerRecordList tabs in DashboardScreen.
// Mirrors frontend getFeedingRecords / getSleepRecords / getHealthRecords from
// frontend/src/lib/api.ts (paths: /tracker/feeding, /tracker/sleep, /tracker/health).
// ---------------------------------------------------------------------------

async function fetchTrackerFeeding(): Promise<FeedingRecord[]> {
  const { data } = await api.get<FeedingRecord[]>('/tracker/feeding');
  return data;
}

async function fetchTrackerSleep(): Promise<SleepRecord[]> {
  const { data } = await api.get<SleepRecord[]>('/tracker/sleep');
  return data;
}

async function fetchTrackerHealth(): Promise<HealthRecord[]> {
  const { data } = await api.get<HealthRecord[]>('/tracker/health');
  return data;
}

async function fetchTrackerDiaper(): Promise<DiaperRecord[]> {
  const { data } = await api.get<DiaperRecord[]>('/tracker/diaper', {
    params: { limit: 100 },
  });
  return data;
}

export const trackerQueries = {
  feeding: () => ({
    queryKey: queryKeys.tracker.feeding(),
    queryFn: fetchTrackerFeeding,
  }),
  sleep: () => ({
    queryKey: queryKeys.tracker.sleep(),
    queryFn: fetchTrackerSleep,
  }),
  health: () => ({
    queryKey: queryKeys.tracker.health(),
    queryFn: fetchTrackerHealth,
  }),
  diaper: () => ({
    queryKey: queryKeys.tracker.diaper(),
    queryFn: fetchTrackerDiaper,
  }),
};
