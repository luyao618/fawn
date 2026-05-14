import { Pencil, Trash2 } from 'lucide-react';
import { formatDate, toKg } from '@/lib/utils';
import type { GrowthRecord } from '@/lib/types';

interface GrowthHistoryListProps {
  records: GrowthRecord[];
  onEdit?: (record: GrowthRecord) => void;
  onDelete?: (record: GrowthRecord) => void;
}

export function GrowthHistoryList({ records, onEdit, onDelete }: GrowthHistoryListProps) {
  const sorted = [...records].sort((a, b) => b.measurement_date.localeCompare(a.measurement_date));

  if (sorted.length === 0) {
    return <p className="py-4 text-center text-sm text-mid-gray">暂无成长记录</p>;
  }

  return (
    <div className="space-y-2">
      {sorted.map((record) => {
        const fields: string[] = [];
        if (record.weight_g != null) fields.push(toKg(record.weight_g));
        if (record.height_cm != null) fields.push(`${record.height_cm}cm`);
        if (record.head_cm != null) fields.push(`头围 ${record.head_cm}cm`);

        return (
          <div key={record.id} className="flex items-start gap-3 rounded-2xl bg-warm-gray px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-soft-charcoal">
                {formatDate(record.measurement_date)}
              </p>
              {fields.length > 0 ? (
                <p className="mt-0.5 text-xs text-dark-gray">{fields.join(' · ')}</p>
              ) : null}
              {record.notes ? (
                <p className="mt-0.5 text-xs text-mid-gray">{record.notes}</p>
              ) : null}
            </div>
            {onEdit || onDelete ? (
              <div className="flex shrink-0 gap-1">
                {onEdit ? (
                  <button
                    type="button"
                    onClick={() => onEdit(record)}
                    aria-label={`编辑 ${record.measurement_date} 成长记录`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-white hover:text-brand-strong"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(record)}
                    aria-label={`删除 ${record.measurement_date} 成长记录`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-white hover:text-safety-red"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
