import { Card } from '@/components/ui/Card';
import type { SleepStatsData } from '@/lib/types';

export function SleepStats({ data }: { data: SleepStatsData }) {
  return (
    <Card>
      <p className="text-sm text-dark-gray">睡眠统计</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="font-mono text-[28px] font-bold leading-tight">{data.average_daily_hours.toFixed(1)}</p>
          <p className="text-sm text-dark-gray">日均小时</p>
        </div>
        <div>
          <p className="font-mono text-[28px] font-bold leading-tight">{data.average_night_wakings.toFixed(1)}</p>
          <p className="text-sm text-dark-gray">平均夜醒</p>
        </div>
      </div>
    </Card>
  );
}
