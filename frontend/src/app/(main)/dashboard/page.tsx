'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, RefreshCw, Sparkles } from 'lucide-react';
import { BabyInfoCard } from '@/components/dashboard/BabyInfoCard';
import { FeedingStats } from '@/components/dashboard/FeedingStats';
import { GrowthChart } from '@/components/dashboard/GrowthChart';
import { HealthTimeline } from '@/components/dashboard/HealthTimeline';
import { SleepStats } from '@/components/dashboard/SleepStats';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, toKg } from '@/lib/utils';
import type {
  DashboardSummary,
  FeedingRecord,
  FeedingStatsData,
  GrowthChartData,
  GrowthRecord,
  HealthRecord,
  SleepStatsData,
  SleepRecord,
} from '@/lib/types';

type Indicator = 'weight' | 'height' | 'head';
type RecentRecord = {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string;
};

const feedTypeLabel: Record<FeedingRecord['feed_type'], string> = {
  breast: '母乳',
  formula: '配方奶',
  solid: '辅食',
};

const healthTypeLabel: Record<HealthRecord['record_type'], string> = {
  vaccination: '疫苗',
  illness: '不适',
  checkup: '体检',
};

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-white/70 shadow-card ${className}`} />;
}

function recentFromRecords(
  growthRecords: GrowthRecord[],
  feedingRecords: FeedingRecord[],
  sleepRecords: SleepRecord[],
  healthRecords: HealthRecord[],
) {
  const growth: RecentRecord[] = growthRecords.map((record) => ({
    id: record.id,
    type: '生长',
    title: `${formatDate(record.measurement_date)} 生长记录`,
    detail: `${toKg(record.weight_g)} · ${record.height_cm ?? '暂无'}cm · 头围 ${record.head_cm ?? '暂无'}cm`,
    at: record.measurement_date,
  }));
  const feeding: RecentRecord[] = feedingRecords.map((record) => ({
    id: record.id,
    type: '喂养',
    title: `${formatDateTime(record.feed_time)} 喂养`,
    detail: `${feedTypeLabel[record.feed_type]} · ${
      record.amount_ml ? `${record.amount_ml}ml` : record.duration_min ? `${record.duration_min}分钟` : '未填写数量'
    }`,
    at: record.feed_time,
  }));
  const sleep: RecentRecord[] = sleepRecords.map((record) => ({
    id: record.id,
    type: '睡眠',
    title: `${formatDateTime(record.sleep_start)} ${record.sleep_type === 'night' ? '夜睡' : '小睡'}`,
    detail: `夜醒 ${record.night_wakings} 次${record.sleep_end ? ` · 至 ${formatDateTime(record.sleep_end)}` : ''}`,
    at: record.sleep_start,
  }));
  const health: RecentRecord[] = healthRecords.map((record) => ({
    id: record.id,
    type: '健康',
    title: `${formatDate(record.record_date)} ${record.title}`,
    detail: `${healthTypeLabel[record.record_type]}${record.description ? ` · ${record.description}` : ''}`,
    at: record.record_date,
  }));

  return [...growth, ...feeding, ...sleep, ...health]
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 5);
}

function DashboardInsight({ summary }: { summary: DashboardSummary }) {
  return (
    <Card className="bg-gradient-to-br from-white to-fawn-amber-light">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nursery-mint text-brand-strong">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fawn-amber">今日摘要</p>
          <h2 className="mt-1 text-xl font-semibold leading-tight text-soft-charcoal">
            {summary.baby.name}今天有 {summary.today_feeding.count} 次喂养，睡眠约{' '}
            {summary.today_sleep.total_hours.toFixed(1)} 小时
          </h2>
          <p className="mt-2 text-sm leading-6 text-dark-gray">
            最近记录会影响趋势判断。需要补记奶量、睡眠或体重时，可以直接进入记录页。
          </p>
          <Link
            href="/record"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-fawn-amber px-4 text-sm font-semibold text-white shadow-card"
          >
            去记录
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Card>
  );
}

function RecentRecords({ records }: { records: RecentRecord[] }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-dark-gray">最近记录</p>
          <h2 className="text-[17px] font-semibold text-soft-charcoal">轻量回顾</h2>
        </div>
        <Link
          href="/record"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-nursery-mint text-brand-strong"
          aria-label="新增记录"
        >
          <ClipboardList className="h-5 w-5" aria-hidden />
        </Link>
      </div>
      <div className="space-y-3">
        {records.map((record) => (
          <div key={`${record.type}-${record.id}`} className="flex gap-3 rounded-2xl bg-warm-gray p-3">
            <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-semibold text-fawn-amber">
              {record.type}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-soft-charcoal">{record.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-dark-gray">{record.detail}</p>
            </div>
          </div>
        ))}
        {records.length === 0 ? <p className="py-3 text-center text-sm text-mid-gray">暂无记录</p> : null}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [growth, setGrowth] = useState<GrowthChartData | null>(null);
  const [feeding, setFeeding] = useState<FeedingStatsData | null>(null);
  const [sleep, setSleep] = useState<SleepStatsData | null>(null);
  const [health, setHealth] = useState<HealthRecord[] | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [indicator, setIndicator] = useState<Indicator>('weight');
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const [
        summaryData,
        growthData,
        feedingData,
        sleepData,
        healthData,
        growthRecords,
        feedingRecords,
        sleepRecords,
      ] = await Promise.all([
        api.getDashboardSummary(),
        api.getGrowthChart(),
        api.getFeedingStats(7),
        api.getSleepStats(7),
        api.getHealthRecords(),
        api.getGrowthRecords(),
        api.getFeedingRecords(),
        api.getSleepRecords(),
      ]);
      setSummary(summaryData);
      setGrowth(growthData);
      setFeeding(feedingData);
      setSleep(sleepData);
      setHealth(healthData);
      setRecentRecords(recentFromRecords(growthRecords, feedingRecords, sleepRecords, healthData));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void loadDashboard()}
          loading={refreshing}
          className="min-h-10 px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </Button>
      </div>

      {summary ? <DashboardInsight summary={summary} /> : <Skeleton className="h-52" />}
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
      <RecentRecords records={recentRecords} />
    </div>
  );
}
