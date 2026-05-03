'use client';

import { FormEvent, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDateTime, toKg } from '@/lib/utils';
import type {
  FeedingRecord,
  GrowthRecord,
  HealthRecord,
  SleepRecord,
  TrackerRecord,
  TrackerType,
} from '@/lib/types';

interface TrackerRecordListProps {
  type: TrackerType;
  records: TrackerRecord[];
  onTypeChange?: (type: TrackerType) => void;
  onEdit: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  canWrite: boolean;
}

const tabs: Array<{ type: TrackerType; label: string }> = [
  { type: 'growth', label: '生长' },
  { type: 'feeding', label: '喂养' },
  { type: 'sleep', label: '睡眠' },
  { type: 'health', label: '健康' },
];

const feedTypeLabel: Record<FeedingRecord['feed_type'], string> = {
  breast: '母乳',
  formula: '配方奶',
  solid: '辅食',
};

function summary(type: TrackerType, record: TrackerRecord) {
  if (type === 'growth') {
    const item = record as GrowthRecord;
    return `${item.measurement_date} · ${toKg(item.weight_g)} · ${item.height_cm ?? '暂无'}cm`;
  }
  if (type === 'feeding') {
    const item = record as FeedingRecord;
    const amount =
      item.amount_ml != null ? `${item.amount_ml}ml` : item.duration_min != null ? `${item.duration_min}分钟` : '未填写数量';
    return `${formatDateTime(item.feed_time)} · ${feedTypeLabel[item.feed_type]} · ${amount}`;
  }
  if (type === 'sleep') {
    const item = record as SleepRecord;
    return `${formatDateTime(item.sleep_start)} · ${item.sleep_type === 'night' ? '夜间睡眠' : '小睡'} · 夜醒 ${item.night_wakings} 次`;
  }
  const item = record as HealthRecord;
  return `${item.record_date} · ${item.title}`;
}

export function TrackerRecordList({ type, records, onTypeChange, onEdit, onDelete, canWrite }: TrackerRecordListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState('');

  function beginEdit(record: TrackerRecord) {
    setEditingId(record.id);
    const { id: _id, ...editable } = record as unknown as Record<string, unknown>;
    setEditJson(JSON.stringify(editable, null, 2));
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    const updates = JSON.parse(editJson) as Record<string, unknown>;
    await onEdit(editingId, updates);
    setEditingId(null);
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Tracker 记录</h2>
      </div>
      <div className="mb-3 grid grid-cols-4 rounded-xl bg-warm-gray p-1">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.type}
            onClick={() => onTypeChange?.(tab.type)}
            className={`min-h-10 rounded-lg text-sm ${type === tab.type ? 'bg-white text-fawn-amber shadow-card' : 'text-dark-gray'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {records.map((record) => (
          <div key={record.id} className="rounded-xl border border-oat-border bg-warm-cream p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-soft-charcoal">{summary(type, record)}</p>
              {canWrite ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => beginEdit(record)}
                    className="grid h-11 w-11 place-items-center rounded-full text-fawn-amber"
                    aria-label="编辑记录"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('确认删除这条记录？')) void onDelete(record.id);
                    }}
                    className="grid h-11 w-11 place-items-center rounded-full text-safety-red"
                    aria-label="删除记录"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
            {editingId === record.id ? (
              <form onSubmit={submitEdit} className="mt-3 space-y-2">
                <textarea
                  value={editJson}
                  onChange={(event) => setEditJson(event.target.value)}
                  className="min-h-32 w-full rounded-xl border border-oat-border bg-white p-3 font-mono text-xs outline-none focus:border-fawn-amber"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="text" onClick={() => setEditingId(null)}>
                    取消
                  </Button>
                  <Button type="submit" className="min-h-10 px-4 py-2 text-sm">
                    保存
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ))}
        {records.length === 0 ? <p className="py-4 text-center text-sm text-mid-gray">暂无记录</p> : null}
      </div>
    </Card>
  );
}
