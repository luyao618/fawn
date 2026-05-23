import { Card } from '@/components/ui/Card';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { DiaperRecord, DiaperStatsData } from '@/lib/types';

const diaperTypeLabel: Record<DiaperRecord['diaper_type'], string> = {
  poop: '大便',
  pee: '小便',
  mixed: '混合',
};

function averageLabel(value: number) {
  return value.toFixed(1).replace(/\.0$/, '');
}

export function DiaperHistory({ records, limit }: { records: DiaperRecord[]; limit?: number }) {
  const sorted = [...records].sort((left, right) => right.diaper_time.localeCompare(left.diaper_time));
  const visible = typeof limit === 'number' ? sorted.slice(0, limit) : sorted;

  if (visible.length === 0) {
    return <p className="py-4 text-center text-sm text-mid-gray">暂无大小便记录</p>;
  }

  return (
    <div className="space-y-2">
      {visible.map((record) => (
        <div key={record.id} className="rounded-2xl bg-warm-gray px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-soft-charcoal">{diaperTypeLabel[record.diaper_type]}</p>
              <p className="mt-0.5 text-xs text-dark-gray">{formatDateTime(record.diaper_time)}</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-brand-strong">
              {formatDate(record.diaper_time)}
            </span>
          </div>
          {record.notes ? <p className="mt-1 text-xs leading-5 text-mid-gray">{record.notes}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function DiaperStats({ data, records }: { data: DiaperStatsData; records: DiaperRecord[] }) {
  const latest = data.daily[data.daily.length - 1] ?? { poop: 0, pee: 0, mixed: 0, total: 0 };

  return (
    <Card>
      <p className="text-sm text-dark-gray">大小便统计</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{latest.total}</p>
          <p className="text-xs text-dark-gray">今日总次数</p>
        </div>
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{latest.poop}</p>
          <p className="text-xs text-dark-gray">大便</p>
        </div>
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{latest.pee}</p>
          <p className="text-xs text-dark-gray">小便</p>
        </div>
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{latest.mixed}</p>
          <p className="text-xs text-dark-gray">混合</p>
        </div>
      </div>
      <div className="mt-3 rounded-2xl bg-nursery-mint/40 px-3 py-2 text-xs leading-5 text-dark-gray">
        {data.days} 日均 {averageLabel(data.average_daily_total)} 次 · 大便{' '}
        {averageLabel(data.average_daily_poop)} · 小便 {averageLabel(data.average_daily_pee)} · 混合{' '}
        {averageLabel(data.average_daily_mixed)}
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-soft-charcoal">大小便历史</h3>
          <span className="text-xs text-mid-gray">最近 {Math.min(records.length, 5)} 条</span>
        </div>
        <DiaperHistory records={records} limit={5} />
      </div>
    </Card>
  );
}
