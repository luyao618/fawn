import type { DashboardLatestGrowth, DashboardLatestGrowthMetric } from '@/lib/types';

interface MetricInlineProps {
  label: string;
  unit: 'kg' | 'cm';
  metric: DashboardLatestGrowthMetric | null;
}

function formatValue(metric: DashboardLatestGrowthMetric, unit: 'kg' | 'cm'): string {
  if (unit === 'kg') return `${(metric.value / 1000).toFixed(2)}kg`;
  return `${metric.value}${unit}`;
}

function MetricInline({ label, unit, metric }: MetricInlineProps) {
  if (!metric) {
    return (
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-mid-gray">{label}</p>
        <p className="font-mono text-[13px] font-semibold leading-tight text-mid-gray">--</p>
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] text-dark-gray">{label}</p>
      <p className="font-mono text-[13px] font-semibold leading-tight text-soft-charcoal">
        {formatValue(metric, unit)}
        {metric.percentile != null ? (
          <span className="ml-1 text-[10px] font-normal text-sage-green">
            P{metric.percentile}
          </span>
        ) : null}
      </p>
    </div>
  );
}

interface LatestGrowthCardsProps {
  latest: DashboardLatestGrowth | null;
}

export function LatestGrowthCards({ latest }: LatestGrowthCardsProps) {
  if (latest === null) {
    return (
      <div className="rounded-2xl bg-warm-gray px-3 py-2">
        <p className="text-[11px] text-mid-gray">最新成长 · 暂无记录</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-warm-gray px-3 py-2">
      <MetricInline label="体重" unit="kg" metric={latest.weight} />
      <MetricInline label="身高" unit="cm" metric={latest.height} />
      <MetricInline label="头围" unit="cm" metric={latest.head} />
    </div>
  );
}
