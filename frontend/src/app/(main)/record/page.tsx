'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Moon, Ruler, Stethoscope, Utensils } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { canWriteTracker, formatDate } from '@/lib/utils';
import type {
  DashboardSummary,
  FeedingRecordCreate,
  GrowthRecordCreate,
  HealthRecordCreate,
  SleepRecordCreate,
} from '@/lib/types';

type RecordKind = 'feeding' | 'sleep' | 'growth' | 'health';

interface RecordCard {
  kind: RecordKind;
  label: string;
  description: string;
  meta: string;
  icon: LucideIcon;
  tint: string;
}

const recordCards: RecordCard[] = [
  {
    kind: 'feeding',
    label: '喂养',
    description: '奶量、亲喂时长、辅食',
    meta: '常用',
    icon: Utensils,
    tint: 'bg-nursery-butter text-warning-amber',
  },
  {
    kind: 'sleep',
    label: '睡眠',
    description: '小睡、夜睡、夜醒次数',
    meta: '节律',
    icon: Moon,
    tint: 'bg-nursery-powder text-info-blue',
  },
  {
    kind: 'growth',
    label: '生长',
    description: '体重、身高、头围',
    meta: '曲线',
    icon: Ruler,
    tint: 'bg-nursery-mint text-brand-strong',
  },
  {
    kind: 'health',
    label: '健康',
    description: '疫苗、就诊、身体状况',
    meta: '重要',
    icon: Stethoscope,
    tint: 'bg-safety-red-light text-safety-red',
  },
];

const inputClass =
  'mt-1 min-h-11 w-full rounded-2xl border border-oat-border bg-white px-3 text-base text-soft-charcoal outline-none transition-colors focus:border-fawn-amber disabled:bg-warm-gray disabled:text-mid-gray';
const labelClass = 'block text-sm font-semibold text-dark-gray';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localDateTimeInputValue(date = new Date()) {
  return `${localDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function intOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number.parseInt(trimmed, 10) : null;
}

function floatOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number.parseFloat(trimmed) : null;
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function initialFeedingForm() {
  return {
    feed_time: localDateTimeInputValue(),
    feed_type: 'formula' as FeedingRecordCreate['feed_type'],
    amount_ml: '',
    duration_min: '',
    notes: '',
  };
}

function initialSleepForm() {
  const start = new Date();
  const end = new Date(start.getTime() + 90 * 60_000);
  return {
    sleep_start: localDateTimeInputValue(start),
    sleep_end: localDateTimeInputValue(end),
    sleep_type: 'nap' as SleepRecordCreate['sleep_type'],
    night_wakings: '0',
    notes: '',
  };
}

function initialGrowthForm() {
  return {
    measurement_date: localDateInputValue(),
    weight_g: '',
    height_cm: '',
    head_cm: '',
  };
}

function initialHealthForm() {
  return {
    record_date: localDateInputValue(),
    record_type: 'checkup' as HealthRecordCreate['record_type'],
    title: '',
    description: '',
  };
}

export default function RecordPage() {
  const user = useAuthStore((state) => state.user);
  const canWrite = canWriteTracker(user?.role, user?.permissions);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activeKind, setActiveKind] = useState<RecordKind>('feeding');
  const [feeding, setFeeding] = useState(initialFeedingForm);
  const [sleep, setSleep] = useState(initialSleepForm);
  const [growth, setGrowth] = useState(initialGrowthForm);
  const [health, setHealth] = useState(initialHealthForm);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getDashboardSummary()
      .then((data) => {
        if (active) setSummary(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const activeCard = useMemo(() => recordCards.find((card) => card.kind === activeKind) ?? recordCards[0], [activeKind]);
  const ActiveIcon = activeCard.icon;

  function resetActiveForm() {
    if (activeKind === 'feeding') setFeeding(initialFeedingForm());
    if (activeKind === 'sleep') setSleep(initialSleepForm());
    if (activeKind === 'growth') setGrowth(initialGrowthForm());
    if (activeKind === 'health') setHealth(initialHealthForm());
  }

  async function submitRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite) return;

    setSubmitting(true);
    setStatus(null);
    try {
      if (activeKind === 'feeding') {
        await api.createFeedingRecord({
          feed_time: toIsoDateTime(feeding.feed_time),
          feed_type: feeding.feed_type,
          amount_ml: intOrNull(feeding.amount_ml),
          duration_min: intOrNull(feeding.duration_min),
          notes: textOrNull(feeding.notes),
        });
      }

      if (activeKind === 'sleep') {
        await api.createSleepRecord({
          sleep_start: toIsoDateTime(sleep.sleep_start),
          sleep_end: sleep.sleep_end ? toIsoDateTime(sleep.sleep_end) : null,
          sleep_type: sleep.sleep_type,
          night_wakings: intOrNull(sleep.night_wakings) ?? 0,
          notes: textOrNull(sleep.notes),
        });
      }

      if (activeKind === 'growth') {
        const payload: GrowthRecordCreate = {
          measurement_date: growth.measurement_date,
          weight_g: intOrNull(growth.weight_g),
          height_cm: floatOrNull(growth.height_cm),
          head_cm: floatOrNull(growth.head_cm),
        };
        await api.createGrowthRecord(payload);
      }

      if (activeKind === 'health') {
        await api.createHealthRecord({
          record_date: health.record_date,
          record_type: health.record_type,
          title: health.title.trim(),
          description: textOrNull(health.description),
        });
      }

      setStatus({ type: 'success', message: `${activeCard.label}已保存，成长看板会同步更新。` });
      resetActiveForm();
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '保存失败，请稍后再试' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 px-4 py-4">
      <section className="space-y-2 px-1">
        <p className="text-sm font-semibold text-fawn-amber">{formatDate(new Date(), 'M月d日 EEEE')}</p>
        <h2 className="text-[26px] font-semibold leading-tight text-soft-charcoal">
          记录{summary?.baby.name ?? '宝宝'}今天的变化
        </h2>
        <p className="text-sm leading-6 text-dark-gray">
          快速补充喂养、睡眠、生长和健康记录，AI 管家会在后续对话和成长看板里使用这些信息。
        </p>
      </section>

      {!canWrite ? (
        <div className="rounded-card border border-warning-amber bg-warning-amber-light p-4 text-sm leading-6 text-dark-gray" role="status">
          当前账号只有查看权限，无法新增记录。请让父母或管理员账号记录，已有数据仍可在成长页查看。
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {recordCards.map((card) => {
          const Icon = card.icon;
          const active = card.kind === activeKind;
          return (
            <button
              key={card.kind}
              type="button"
              onClick={() => {
                setActiveKind(card.kind);
                setStatus(null);
              }}
              aria-pressed={active}
              className={`min-h-[128px] rounded-card border bg-white p-4 text-left shadow-card transition-colors ${
                active ? 'border-fawn-amber ring-2 ring-nursery-mint' : 'border-white/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${card.tint}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="rounded-full bg-warm-gray px-2 py-1 text-[11px] font-semibold text-mid-gray">
                  {card.meta}
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold leading-tight text-soft-charcoal">{card.label}</p>
              <p className="mt-1 text-xs leading-5 text-dark-gray">{card.description}</p>
            </button>
          );
        })}
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${activeCard.tint}`}>
            <ActiveIcon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-semibold leading-tight text-soft-charcoal">保存{activeCard.label}</h3>
            <p className="mt-1 text-sm text-dark-gray">{activeCard.description}</p>
          </div>
        </div>

        <form onSubmit={submitRecord} className="space-y-4">
          {activeKind === 'feeding' ? (
            <>
              <label className={labelClass}>
                时间
                <input
                  type="datetime-local"
                  required
                  value={feeding.feed_time}
                  onChange={(event) => setFeeding((value) => ({ ...value, feed_time: event.target.value }))}
                  disabled={!canWrite}
                  className={inputClass}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                <label className={labelClass}>
                  类型
                  <select
                    value={feeding.feed_type}
                    onChange={(event) =>
                      setFeeding((value) => ({
                        ...value,
                        feed_type: event.target.value as FeedingRecordCreate['feed_type'],
                      }))
                    }
                    disabled={!canWrite}
                    className={inputClass}
                  >
                    <option value="breast">母乳</option>
                    <option value="formula">配方奶</option>
                    <option value="solid">辅食</option>
                  </select>
                </label>
                <label className={labelClass}>
                  奶量 (ml)
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={feeding.amount_ml}
                    onChange={(event) => setFeeding((value) => ({ ...value, amount_ml: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className={labelClass}>
                时长 (分钟)
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={feeding.duration_min}
                  onChange={(event) => setFeeding((value) => ({ ...value, duration_min: event.target.value }))}
                  disabled={!canWrite}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                备注
                <textarea
                  rows={3}
                  value={feeding.notes}
                  onChange={(event) => setFeeding((value) => ({ ...value, notes: event.target.value }))}
                  disabled={!canWrite}
                  className={`${inputClass} py-3`}
                  placeholder="例如：精神好，喝完后拍嗝顺利"
                />
              </label>
            </>
          ) : null}

          {activeKind === 'sleep' ? (
            <>
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                <label className={labelClass}>
                  开始
                  <input
                    type="datetime-local"
                    required
                    value={sleep.sleep_start}
                    onChange={(event) => setSleep((value) => ({ ...value, sleep_start: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  结束
                  <input
                    type="datetime-local"
                    value={sleep.sleep_end}
                    onChange={(event) => setSleep((value) => ({ ...value, sleep_end: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                <label className={labelClass}>
                  类型
                  <select
                    value={sleep.sleep_type}
                    onChange={(event) =>
                      setSleep((value) => ({ ...value, sleep_type: event.target.value as SleepRecordCreate['sleep_type'] }))
                    }
                    disabled={!canWrite}
                    className={inputClass}
                  >
                    <option value="nap">小睡</option>
                    <option value="night">夜睡</option>
                  </select>
                </label>
                <label className={labelClass}>
                  夜醒次数
                  <input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={sleep.night_wakings}
                    onChange={(event) => setSleep((value) => ({ ...value, night_wakings: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
              </div>
              <label className={labelClass}>
                备注
                <textarea
                  rows={3}
                  value={sleep.notes}
                  onChange={(event) => setSleep((value) => ({ ...value, notes: event.target.value }))}
                  disabled={!canWrite}
                  className={`${inputClass} py-3`}
                  placeholder="例如：入睡快，中间醒了一次"
                />
              </label>
            </>
          ) : null}

          {activeKind === 'growth' ? (
            <>
              <label className={labelClass}>
                日期
                <input
                  type="date"
                  required
                  value={growth.measurement_date}
                  onChange={(event) => setGrowth((value) => ({ ...value, measurement_date: event.target.value }))}
                  disabled={!canWrite}
                  className={inputClass}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-3">
                <label className={labelClass}>
                  体重 (g)
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={growth.weight_g}
                    onChange={(event) => setGrowth((value) => ({ ...value, weight_g: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  身高 (cm)
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    inputMode="decimal"
                    value={growth.height_cm}
                    onChange={(event) => setGrowth((value) => ({ ...value, height_cm: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  头围 (cm)
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    inputMode="decimal"
                    value={growth.head_cm}
                    onChange={(event) => setGrowth((value) => ({ ...value, head_cm: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
              </div>
            </>
          ) : null}

          {activeKind === 'health' ? (
            <>
              <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
                <label className={labelClass}>
                  日期
                  <input
                    type="date"
                    required
                    value={health.record_date}
                    onChange={(event) => setHealth((value) => ({ ...value, record_date: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  类型
                  <select
                    value={health.record_type}
                    onChange={(event) =>
                      setHealth((value) => ({
                        ...value,
                        record_type: event.target.value as HealthRecordCreate['record_type'],
                      }))
                    }
                    disabled={!canWrite}
                    className={inputClass}
                  >
                    <option value="checkup">体检</option>
                    <option value="vaccination">疫苗</option>
                    <option value="illness">不适</option>
                  </select>
                </label>
              </div>
              <label className={labelClass}>
                标题
                <input
                  required
                  maxLength={200}
                  value={health.title}
                  onChange={(event) => setHealth((value) => ({ ...value, title: event.target.value }))}
                  disabled={!canWrite}
                  className={inputClass}
                  placeholder="例如：儿保复查"
                />
              </label>
              <label className={labelClass}>
                说明
                <textarea
                  rows={3}
                  value={health.description}
                  onChange={(event) => setHealth((value) => ({ ...value, description: event.target.value }))}
                  disabled={!canWrite}
                  className={`${inputClass} py-3`}
                  placeholder="记录医生建议、症状或观察重点"
                />
              </label>
            </>
          ) : null}

          {status ? (
            <p
              role="status"
              className={`rounded-2xl px-3 py-2 text-sm ${
                status.type === 'success'
                  ? 'bg-nursery-mint text-brand-strong'
                  : 'bg-safety-red-light text-safety-red'
              }`}
            >
              {status.message}
            </p>
          ) : null}

          <Button type="submit" loading={submitting} disabled={!canWrite} className="w-full">
            保存{activeCard.label}
          </Button>
        </form>
      </Card>
    </div>
  );
}
