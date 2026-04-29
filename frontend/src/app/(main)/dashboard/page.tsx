'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BabyInfoCard } from '@/components/dashboard/BabyInfoCard';
import { FeedingStats } from '@/components/dashboard/FeedingStats';
import { GrowthChart } from '@/components/dashboard/GrowthChart';
import { HealthTimeline } from '@/components/dashboard/HealthTimeline';
import { SleepStats } from '@/components/dashboard/SleepStats';
import { TrackerRecordList } from '@/components/dashboard/TrackerRecordList';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { canWriteTracker } from '@/lib/utils';
import type {
  DashboardSummary,
  FeedingStatsData,
  GrowthChartData,
  HealthRecord,
  SleepStatsData,
  TrackerRecord,
  TrackerType,
} from '@/lib/types';

type Indicator = 'weight' | 'height' | 'head';

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-white/70 shadow-card ${className}`} />;
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [growth, setGrowth] = useState<GrowthChartData | null>(null);
  const [feeding, setFeeding] = useState<FeedingStatsData | null>(null);
  const [sleep, setSleep] = useState<SleepStatsData | null>(null);
  const [health, setHealth] = useState<HealthRecord[] | null>(null);
  const [trackerType, setTrackerType] = useState<TrackerType>('growth');
  const [records, setRecords] = useState<TrackerRecord[]>([]);
  const [indicator, setIndicator] = useState<Indicator>('weight');
  const [refreshing, setRefreshing] = useState(false);

  const loadRecords = useCallback(async (type: TrackerType) => {
    if (type === 'growth') setRecords(await api.getGrowthRecords());
    if (type === 'feeding') setRecords(await api.getFeedingRecords());
    if (type === 'sleep') setRecords(await api.getSleepRecords());
    if (type === 'health') setRecords(await api.getHealthRecords());
  }, []);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    const [summaryData, growthData, feedingData, sleepData, healthData] = await Promise.all([
      api.getDashboardSummary(),
      api.getGrowthChart(),
      api.getFeedingStats(7),
      api.getSleepStats(7),
      api.getHealthRecords(),
    ]);
    setSummary(summaryData);
    setGrowth(growthData);
    setFeeding(feedingData);
    setSleep(sleepData);
    setHealth(healthData);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadRecords(trackerType);
  }, [loadRecords, trackerType]);

  async function changeType(type: TrackerType) {
    setTrackerType(type);
    await loadRecords(type);
  }

  async function editRecord(id: string, updates: Record<string, unknown>) {
    await api.updateTrackerRecord(trackerType, id, updates);
    await Promise.all([loadRecords(trackerType), loadDashboard()]);
  }

  async function deleteRecord(id: string) {
    await api.deleteTrackerRecord(trackerType, id);
    await Promise.all([loadRecords(trackerType), loadDashboard()]);
  }

  const canWrite = canWriteTracker(user?.role, user?.permissions);

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void Promise.all([loadDashboard(), loadRecords(trackerType)])}
          loading={refreshing}
          className="min-h-10 px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </Button>
      </div>

      {summary ? <BabyInfoCard summary={summary} /> : <Skeleton className="h-40" />}
      {growth ? (
        <GrowthChart data={growth} activeIndicator={indicator} onIndicatorChange={setIndicator} />
      ) : (
        <Skeleton className="h-80" />
      )}

      <div className="grid grid-cols-1 gap-4 min-[390px]:grid-cols-2">
        {feeding ? <FeedingStats data={feeding} /> : <Skeleton className="h-48" />}
        {sleep ? <SleepStats data={sleep} /> : <Skeleton className="h-48" />}
      </div>

      {health ? <HealthTimeline records={health} /> : <Skeleton className="h-52" />}

      <TrackerRecordList
        type={trackerType}
        records={records}
        canWrite={canWrite}
        onTypeChange={(type) => void changeType(type)}
        onEdit={editRecord}
        onDelete={deleteRecord}
      />
    </div>
  );
}
