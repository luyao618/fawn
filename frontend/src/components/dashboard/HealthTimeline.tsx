import { CalendarCheck, Syringe, Thermometer } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';
import type { HealthRecord } from '@/lib/types';

const iconByType = {
  vaccination: Syringe,
  illness: Thermometer,
  checkup: CalendarCheck,
};

export function HealthTimeline({ records }: { records: HealthRecord[] }) {
  const sorted = [...records].sort(
    (a, b) => new Date(b.record_date).getTime() - new Date(a.record_date).getTime(),
  );

  return (
    <Card>
      <h2 className="mb-3 text-[17px] font-semibold">健康时间线</h2>
      <div className="space-y-4">
        {sorted.map((record) => {
          const Icon = iconByType[record.record_type];
          return (
            <div key={record.id} className="flex gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sage-green-light text-sage-green">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 border-b border-oat-border pb-3 last:border-0 last:pb-0">
                <p className="font-semibold text-soft-charcoal">{record.title}</p>
                <p className="mt-0.5 text-xs text-mid-gray">{formatDate(record.record_date, 'yyyy年M月d日')}</p>
                {record.description ? <p className="mt-1 text-sm text-dark-gray">{record.description}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
