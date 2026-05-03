import { Activity, Moon, Ruler, Stethoscope } from 'lucide-react';

interface DataCardProps {
  type: 'growth' | 'feeding' | 'sleep' | 'health';
  data: Record<string, unknown>;
}

function value(data: Record<string, unknown>, key: string, fallback = '暂无') {
  const raw = data[key];
  if (raw === null || raw === undefined || raw === '') return fallback;
  return String(raw);
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-dark-gray">{label}</p>
      <p className="font-mono text-xl font-bold leading-tight text-soft-charcoal">{children}</p>
    </div>
  );
}

export function DataCard({ type, data }: DataCardProps) {
  const iconClass = 'h-5 w-5 text-brand-strong';
  const title = {
    growth: '生长记录',
    feeding: '喂养统计',
    sleep: '睡眠统计',
    health: '健康事件',
  }[type];
  const Icon = { growth: Ruler, feeding: Activity, sleep: Moon, health: Stethoscope }[type];

  const weight =
    typeof data.weight_g === 'number' ? `${(data.weight_g / 1000).toFixed(1)}kg` : value(data, 'weight_g');

  return (
    <div className="mt-3 max-w-[85vw] rounded-2xl border border-oat-border bg-white p-3 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-soft-charcoal">
        <Icon className={iconClass} aria-hidden />
        {title}
      </div>

      {type === 'growth' ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="体重">{weight}</Stat>
          <Stat label="身高">{value(data, 'height_cm')}cm</Stat>
          <Stat label="WHO">{value(data, 'weight_percentile')}%</Stat>
        </div>
      ) : null}

      {type === 'feeding' ? (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="配方奶">{value(data, 'total_ml')}ml</Stat>
          <Stat label="亲喂">{value(data, 'breast_duration_min')}分</Stat>
          <Stat label="次数">{value(data, 'count')}次</Stat>
        </div>
      ) : null}

      {type === 'sleep' ? (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="睡眠">{value(data, 'total_hours')}h</Stat>
          <Stat label="夜醒">{value(data, 'night_wakings')}次</Stat>
        </div>
      ) : null}

      {type === 'health' ? (
        <div className="rounded-lg bg-warm-gray p-3 text-sm text-soft-charcoal">
          <p className="font-semibold">{value(data, 'title')}</p>
          <p className="mt-1 text-dark-gray">{value(data, 'description')}</p>
        </div>
      ) : null}
    </div>
  );
}
