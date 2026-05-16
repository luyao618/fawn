import { api } from './client';
import { queryKeys } from './queryKeys';
import type {
  DashboardLatestGrowth,
  GrowthChartData,
  GrowthRecord,
} from './types';

async function fetchGrowthRecords(): Promise<GrowthRecord[]> {
  const { data } = await api.get<GrowthRecord[]>('/tracker/growth', {
    params: { limit: 500 },
  });
  return data;
}

async function fetchGrowthChart(): Promise<GrowthChartData> {
  const { data } = await api.get<GrowthChartData>('/dashboard/growth-chart');
  return data;
}

async function fetchLatestGrowth(): Promise<DashboardLatestGrowth | null> {
  const { data } = await api.get<{ latest_growth: DashboardLatestGrowth | null }>(
    '/dashboard/summary',
  );
  return data.latest_growth;
}

export const growthQueries = {
  records: () => ({
    queryKey: queryKeys.growth.records(),
    queryFn: fetchGrowthRecords,
  }),
  chart: () => ({
    queryKey: queryKeys.growth.chart(),
    queryFn: fetchGrowthChart,
  }),
  latest: () => ({
    queryKey: queryKeys.growth.latest(),
    queryFn: fetchLatestGrowth,
  }),
};
