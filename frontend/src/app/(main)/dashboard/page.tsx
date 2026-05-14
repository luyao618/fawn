'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Moon, Ruler, Stethoscope, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { FeedingStats } from '@/components/dashboard/FeedingStats';
import { HealthTimeline } from '@/components/dashboard/HealthTimeline';
import { LatestGrowthCards } from '@/components/dashboard/LatestGrowthCards';
import { SleepStats } from '@/components/dashboard/SleepStats';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { cn, formatDate, formatDateTime, toKg } from '@/lib/utils';
import type {
  DashboardSummary,
  FeedingRecord,
  FeedingStatsData,
  GrowthRecord,
  GrowthReferenceP50,
  HealthRecord,
  SleepStatsData,
  SleepRecord,
} from '@/lib/types';

type RecentRecordType = '生长' | '喂养' | '睡眠' | '健康';
type RecentRecord = {
  id: string;
  type: RecentRecordType;
  title: string;
  detail: string;
  at: string;
};
type DashboardSettledResult<T> = PromiseSettledResult<T>;

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
const STATS_HISTORY_DAYS = 90;
const recentTypeStyle: Record<
  RecentRecordType,
  {
    icon: LucideIcon;
    iconBox: string;
    label: string;
  }
> = {
  喂养: {
    icon: Utensils,
    iconBox: 'bg-fawn-amber-light text-fawn-amber',
    label: 'text-fawn-amber',
  },
  睡眠: {
    icon: Moon,
    iconBox: 'bg-[#EEF4F8] text-[#6F8EAE]',
    label: 'text-[#6F8EAE]',
  },
  生长: {
    icon: Ruler,
    iconBox: 'bg-sage-green-light text-sage-green',
    label: 'text-sage-green',
  },
  健康: {
    icon: Stethoscope,
    iconBox: 'bg-nursery-mint text-brand-strong',
    label: 'text-brand-strong',
  },
};

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-white/70 shadow-card ${className}`} />;
}

function sortRecentRecords(records: RecentRecord[]) {
  return [...records].sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}

function fulfilledValue<T>(result: DashboardSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
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

  const primaryRecords = [growth, sleep, health, feeding]
    .map((records) => sortRecentRecords(records)[0])
    .filter((record): record is RecentRecord => Boolean(record));
  const selectedIds = new Set(primaryRecords.map((record) => `${record.type}-${record.id}`));
  const remainingRecords = sortRecentRecords([...growth, ...feeding, ...sleep, ...health]).filter(
    (record) => !selectedIds.has(`${record.type}-${record.id}`),
  );

  return sortRecentRecords([...primaryRecords, ...remainingRecords.slice(0, 5 - primaryRecords.length)]).slice(0, 5);
}

function StatChip({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-warm-gray px-3 py-2">
      <p className="text-[11px] text-dark-gray">{label}</p>
      <p className="mt-0.5 whitespace-nowrap font-mono text-base font-bold leading-tight text-soft-charcoal">
        {value}
      </p>
      {hint ? <p className="mt-0.5 whitespace-nowrap text-[11px] text-sage-green">{hint}</p> : null}
    </div>
  );
}

function DashboardOverview({ summary, latestRecord }: { summary: DashboardSummary; latestRecord?: RecentRecord }) {
  if (!summary.baby) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-nursery-powder text-info-blue">
            <ClipboardList className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-fawn-amber">今日摘要</p>
            <h2 className="mt-1 text-[17px] font-semibold leading-tight text-soft-charcoal">还没有宝宝档案</h2>
            <p className="mt-1 text-xs text-dark-gray">喂养、睡眠和生长记录会在创建档案后开始显示。</p>
          </div>
        </div>
        <Link
          href="/profile"
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-nursery-mint px-4 text-sm font-semibold text-brand-strong"
        >
          去家庭页
        </Link>
      </Card>
    );
  }

  const todaySleepValue =
    summary.today_sleep.total_hours == null ? '没数据' : `${summary.today_sleep.total_hours.toFixed(1)}h`;
  const todayBreastDuration = summary.today_feeding.breast_duration_min;
  const latestRecordText = latestRecord ? `${latestRecord.type} · ${latestRecord.title}` : '暂无最近记录';
  const babyName = summary.baby.name ?? '宝宝档案';
  const babyAge = summary.baby.age_display ?? '出生日期待填';

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar label={babyName} role="baby" size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fawn-amber">今日摘要</p>
            <span className="rounded-full bg-nursery-mint px-2 py-1 text-[11px] font-semibold text-brand-strong">
              {babyAge}
            </span>
          </div>
          <h2 className="mt-1 truncate text-[17px] font-semibold leading-tight text-soft-charcoal">
            {babyName} · 喂养 {summary.today_feeding.count} 次 · 睡眠 {todaySleepValue}
          </h2>
          <p className="mt-1 line-clamp-1 text-xs text-dark-gray">最近：{latestRecordText}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatChip
          label="今日喂养"
          value={`${summary.today_feeding.count}次`}
          hint={todayBreastDuration > 0 ? `亲喂 ${todayBreastDuration}分钟` : undefined}
        />
        <StatChip label="今日睡眠" value={todaySleepValue} />
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
        {records.map((record) => {
          const style = recentTypeStyle[record.type];
          const Icon = style.icon;

          return (
            <div
              key={`${record.type}-${record.id}`}
              className="rounded-2xl bg-warm-gray p-3 ring-1 ring-white/70"
            >
              <div className="flex gap-3">
                <div className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl', style.iconBox)}>
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[11px] font-semibold leading-none', style.label)}>{record.type}</p>
                  <p className="mt-1.5 truncate text-sm font-semibold text-soft-charcoal">{record.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-dark-gray">{record.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
        {records.length === 0 ? <p className="py-3 text-center text-sm text-mid-gray">暂无记录</p> : null}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [feeding, setFeeding] = useState<FeedingStatsData | null>(null);
  const [sleep, setSleep] = useState<SleepStatsData | null>(null);
  const [health, setHealth] = useState<HealthRecord[] | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [growthP50, setGrowthP50] = useState<GrowthReferenceP50 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const [
      summaryData,
      feedingData,
      sleepData,
      healthData,
      growthRecords,
      feedingRecords,
      sleepRecords,
    ] = await Promise.allSettled([
      api.getDashboardSummary(),
      api.getFeedingStats(STATS_HISTORY_DAYS),
      api.getSleepStats(STATS_HISTORY_DAYS),
      api.getHealthRecords(),
      api.getGrowthRecords(),
      api.getFeedingRecords(),
      api.getSleepRecords(),
    ] as const);
    const failedCount = [
      summaryData,
      feedingData,
      sleepData,
      healthData,
      growthRecords,
      feedingRecords,
      sleepRecords,
    ].filter((result) => result.status === 'rejected').length;

    if (summaryData.status === 'fulfilled') setSummary(summaryData.value);
    if (feedingData.status === 'fulfilled') setFeeding(feedingData.value);
    if (sleepData.status === 'fulfilled') setSleep(sleepData.value);
    if (healthData.status === 'fulfilled') setHealth(healthData.value);
    if (
      growthRecords.status === 'fulfilled' &&
      feedingRecords.status === 'fulfilled' &&
      sleepRecords.status === 'fulfilled'
    ) {
      setRecentRecords(
        recentFromRecords(
          growthRecords.value,
          feedingRecords.value,
          sleepRecords.value,
          fulfilledValue(healthData, []),
        ),
      );
    }
    setLoadError(failedCount > 0 ? `有 ${failedCount} 项数据暂时没更新，已保留可用内容。` : null);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    let active = true;
    const today = new Date().toISOString().slice(0, 10);
    api.getGrowthReferenceP50(today)
      .then((data) => {
        if (active) setGrowthP50(data);
      })
      .catch((error) => {
        console.warn('Failed to fetch growth P50 reference', error);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4 px-4 pt-4 pb-6">
      {loadError ? (
        <div
          role="status"
          className="rounded-2xl border border-fawn-amber/30 bg-fawn-amber-light px-3 py-2 text-xs leading-5 text-soft-charcoal"
        >
          {loadError}
        </div>
      ) : null}
      {summary ? (
        <DashboardOverview summary={summary} latestRecord={recentRecords[0]} />
      ) : (
        <Skeleton className="h-36" />
      )}
      <LatestGrowthCards
        latest={summary?.latest_growth ?? null}
        referenceP50={growthP50}
        onViewAll={() => router.push('/record?kind=growth')}
      />

      <div className="grid grid-cols-1 gap-4">
        {feeding ? <FeedingStats data={feeding} /> : <Skeleton className="h-48" />}
        {sleep ? <SleepStats data={sleep} /> : <Skeleton className="h-48" />}
      </div>

      {health ? <HealthTimeline records={health} /> : <Skeleton className="h-52" />}
      <RecentRecords records={recentRecords} />
    </div>
  );
}
