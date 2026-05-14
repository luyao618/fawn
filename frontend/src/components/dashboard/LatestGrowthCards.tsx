import { Card } from '@/components/ui/Card';
import type { DashboardLatestGrowth, DashboardLatestGrowthMetric, GrowthReferenceP50 } from '@/lib/types';

interface MetricCardProps {
  label: string;
  unit: string;
  metric: DashboardLatestGrowthMetric | null;
  p50Value: number | null;
  p50Unit: 'g' | 'cm';
}

function formatValue(metric: DashboardLatestGrowthMetric | null, unit: string): string {
  if (!metric) return '尚未记录';
  if (unit === 'kg') return `${(metric.value / 1000).toFixed(2)}kg`;
  return `${metric.value}${unit}`;
}

function formatP50(p50Value: number | null, unit: 'g' | 'cm'): string {
  if (p50Value == null) return 'P50 --';
  const formatted = unit === 'g' ? `${Math.round(p50Value)}g` : `${p50Value.toFixed(1)}cm`;
  return `P50 ${formatted}`;
}

function MetricCard({ label, unit, metric, p50Value, p50Unit }: MetricCardProps) {
  const missing = !metric;
  return (
    <div className="rounded-2xl bg-warm-gray p-3">
      <p className="text-[11px] font-semibold text-dark-gray">
        {label}
        <span className="ml-1 font-normal text-mid-gray">({unit})</span>
      </p>
      <p
        className={`mt-1 font-mono text-base font-bold leading-tight ${
          missing ? 'text-mid-gray' : 'text-soft-charcoal'
        }`}
      >
        {formatValue(metric, unit)}
      </p>
      {metric ? (
        <p className="mt-0.5 text-[11px] text-dark-gray">{metric.date}</p>
      ) : null}
      <p className="mt-0.5 text-[11px] text-sage-green">
        {formatP50(p50Value, p50Unit)}
        {metric?.percentile != null ? ` · 当前 P${metric.percentile}` : ''}
      </p>
    </div>
  );
}

interface LatestGrowthCardsProps {
  latest: DashboardLatestGrowth | null;
  referenceP50: GrowthReferenceP50 | null;
  onViewAll: () => void;
}

export function LatestGrowthCards({ latest, referenceP50, onViewAll }: LatestGrowthCardsProps) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-dark-gray">最新成长</p>
          <h2 className="text-[17px] font-semibold text-soft-charcoal">体重 · 身高 · 头围</h2>
        </div>
      </div>

      {latest === null ? (
        <p className="py-2 text-sm text-mid-gray">暂无成长记录</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard
            label="体重"
            unit="kg"
            metric={latest.weight}
            p50Value={referenceP50?.weight_g ?? null}
            p50Unit="g"
          />
          <MetricCard
            label="身高"
            unit="cm"
            metric={latest.height}
            p50Value={referenceP50?.height_cm ?? null}
            p50Unit="cm"
          />
          <MetricCard
            label="头围"
            unit="cm"
            metric={latest.head}
            p50Value={referenceP50?.head_cm ?? null}
            p50Unit="cm"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="mt-1 text-sm font-semibold text-brand-strong"
      >
        查看全部成长记录 →
      </button>
    </Card>
  );
}
