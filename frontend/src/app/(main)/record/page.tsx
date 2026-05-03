'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  GrowthReferenceP50,
  HealthRecordCreate,
  SleepRecordCreate,
} from '@/lib/types';

type RecordKind = 'feeding' | 'sleep' | 'growth' | 'health';

interface RecordCard {
  kind: RecordKind;
  label: string;
  description: string;
  icon: LucideIcon;
  tint: string;
}

const recordCards: RecordCard[] = [
  {
    kind: 'feeding',
    label: '喂养',
    description: '配方奶量、亲喂时长',
    icon: Utensils,
    tint: 'bg-nursery-butter text-warning-amber',
  },
  {
    kind: 'sleep',
    label: '睡眠',
    description: '小睡、夜睡、夜醒次数',
    icon: Moon,
    tint: 'bg-nursery-powder text-info-blue',
  },
  {
    kind: 'growth',
    label: '生长',
    description: '体重、身高、头围',
    icon: Ruler,
    tint: 'bg-nursery-mint text-brand-strong',
  },
  {
    kind: 'health',
    label: '健康',
    description: '疫苗、就诊、身体状况',
    icon: Stethoscope,
    tint: 'bg-safety-red-light text-safety-red',
  },
];

const feedingTypeOptions: Array<{ value: FeedingRecordCreate['feed_type']; label: string }> = [
  { value: 'formula', label: '配方奶' },
  { value: 'breast', label: '母乳' },
];

const sleepTypeOptions: Array<{ value: SleepRecordCreate['sleep_type']; label: string }> = [
  { value: 'nap', label: '小睡' },
  { value: 'night', label: '夜睡' },
];

const healthTypeOptions: Array<{ value: HealthRecordCreate['record_type']; label: string }> = [
  { value: 'checkup', label: '体检' },
  { value: 'vaccination', label: '疫苗' },
  { value: 'illness', label: '不适' },
];

const inputClass =
  'mt-1 min-h-11 w-full rounded-2xl border border-oat-border bg-white px-3 text-base text-soft-charcoal outline-none transition-colors focus:border-fawn-amber disabled:bg-warm-gray disabled:text-mid-gray';
const labelClass = 'block text-sm font-semibold text-dark-gray';
const helperClass = 'mt-1 block whitespace-nowrap text-[10px] italic leading-tight text-mid-gray';

interface SegmentedChoiceProps<T extends string> {
  label: string;
  ariaLabel: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  columns?: 2 | 3;
  disabled?: boolean;
  onChange: (value: T) => void;
}

function SegmentedChoice<T extends string>({
  label,
  ariaLabel,
  options,
  value,
  columns = 2,
  disabled,
  onChange,
}: SegmentedChoiceProps<T>) {
  const columnsClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={labelClass}>
      <span>{label}</span>
      <div
        role="group"
        aria-label={ariaLabel}
        className={`mt-1 grid ${columnsClass} gap-1 rounded-2xl border border-oat-border bg-warm-gray p-1`}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              disabled={disabled}
              aria-pressed={selected}
              className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:text-mid-gray ${
                selected ? 'bg-white text-fawn-amber shadow-card' : 'text-dark-gray hover:bg-white/70'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

function positiveIntegerOrNull(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label}需要填写大于 0 的整数`);
  }
  const number = Number(trimmed);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label}需要填写有效的整数`);
  }
  return number;
}

function positiveInteger(value: string, label: string) {
  const number = positiveIntegerOrNull(value, label);
  if (number == null) {
    throw new Error(`${label}不能为空`);
  }
  return number;
}

function nonNegativeIntegerOrZero(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label}需要填写 0 或更大的整数`);
  }
  const number = Number(trimmed);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label}需要填写有效的整数`);
  }
  return number;
}

function positiveDecimalOrNull(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`${label}需要填写大于 0 的数字`);
  }
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label}需要填写大于 0 的数字`);
  }
  return number;
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatP50Hint(
  reference: GrowthReferenceP50 | null,
  loading: boolean,
  key: 'weight_g' | 'height_cm' | 'head_cm',
  unit: 'g' | 'cm',
) {
  if (!reference) return loading ? 'P50 ...' : 'P50 --';
  const value = reference[key];
  if (value == null) return 'P50 --';
  const formatted = unit === 'g' ? `${Math.round(value)}g` : `${value.toFixed(1)}cm`;
  return `P50 ${formatted}`;
}

function minDateTimeValue(date: string | undefined) {
  return date ? `${date}T00:00` : undefined;
}

function validateRecordDate(value: string, label: string, birthDate: string | undefined, today: string) {
  if (birthDate && value < birthDate) {
    throw new Error(`${label}不能早于宝宝出生日期`);
  }
  if (value > today) {
    throw new Error(`${label}不能晚于今天`);
  }
}

function validateRecordDateTime(value: string, label: string, birthDate: string | undefined, now: string) {
  if (birthDate && value.slice(0, 10) < birthDate) {
    throw new Error(`${label}不能早于宝宝出生日期`);
  }
  if (value > now) {
    throw new Error(`${label}不能晚于当前时间`);
  }
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
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 60_000);
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
    notes: '',
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
  const [growthReference, setGrowthReference] = useState<GrowthReferenceP50 | null>(null);
  const [growthReferenceLoading, setGrowthReferenceLoading] = useState(false);
  const [growthReferenceUnavailable, setGrowthReferenceUnavailable] = useState(false);
  const growthReferenceCache = useRef(new Map<string, GrowthReferenceP50>());
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

  useEffect(() => {
    if (activeKind !== 'growth' || !growth.measurement_date) return undefined;
    const cached = growthReferenceCache.current.get(growth.measurement_date);
    if (growthReferenceCache.current.has(growth.measurement_date)) {
      setGrowthReference(cached ?? null);
      setGrowthReferenceUnavailable(false);
      setGrowthReferenceLoading(false);
      return undefined;
    }

    let active = true;
    setGrowthReference(null);
    setGrowthReferenceUnavailable(false);
    setGrowthReferenceLoading(true);
    api
      .getGrowthReferenceP50(growth.measurement_date)
      .then((data) => {
        growthReferenceCache.current.set(growth.measurement_date, data);
        if (active) {
          setGrowthReference(data);
          setGrowthReferenceUnavailable(false);
        }
      })
      .catch(() => {
        if (active) {
          setGrowthReference(null);
          setGrowthReferenceUnavailable(true);
        }
      })
      .finally(() => {
        if (active) setGrowthReferenceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeKind, growth.measurement_date]);

  const activeCard = useMemo(() => recordCards.find((card) => card.kind === activeKind) ?? recordCards[0], [activeKind]);
  const ActiveIcon = activeCard.icon;
  const birthDate = summary?.baby.birth_date;
  const minDateTime = minDateTimeValue(birthDate);
  const maxDate = localDateInputValue();
  const maxDateTime = localDateTimeInputValue();

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
        const isFormula = feeding.feed_type === 'formula';
        const isBreast = feeding.feed_type === 'breast';
        validateRecordDateTime(feeding.feed_time, '喂养时间', birthDate, maxDateTime);
        await api.createFeedingRecord({
          feed_time: toIsoDateTime(feeding.feed_time),
          feed_type: feeding.feed_type,
          amount_ml: isFormula ? positiveInteger(feeding.amount_ml, '配方奶量') : null,
          duration_min: isBreast ? positiveInteger(feeding.duration_min, '亲喂时长') : null,
          notes: textOrNull(feeding.notes),
        });
      }

      if (activeKind === 'sleep') {
        validateRecordDateTime(sleep.sleep_start, '睡眠开始时间', birthDate, maxDateTime);
        if (sleep.sleep_end) {
          validateRecordDateTime(sleep.sleep_end, '睡眠结束时间', birthDate, maxDateTime);
          if (sleep.sleep_end <= sleep.sleep_start) {
            throw new Error('睡眠结束时间必须晚于开始时间');
          }
        }
        await api.createSleepRecord({
          sleep_start: toIsoDateTime(sleep.sleep_start),
          sleep_end: sleep.sleep_end ? toIsoDateTime(sleep.sleep_end) : null,
          sleep_type: sleep.sleep_type,
          night_wakings: sleep.sleep_type === 'night' ? nonNegativeIntegerOrZero(sleep.night_wakings, '夜醒次数') : 0,
          notes: textOrNull(sleep.notes),
        });
      }

      if (activeKind === 'growth') {
        validateRecordDate(growth.measurement_date, '生长记录日期', birthDate, maxDate);
        const payload: GrowthRecordCreate = {
          measurement_date: growth.measurement_date,
          weight_g: positiveIntegerOrNull(growth.weight_g, '体重'),
          height_cm: positiveDecimalOrNull(growth.height_cm, '身高'),
          head_cm: positiveDecimalOrNull(growth.head_cm, '头围'),
          notes: textOrNull(growth.notes),
        };
        await api.createGrowthRecord(payload);
      }

      if (activeKind === 'health') {
        validateRecordDate(health.record_date, '健康记录日期', birthDate, maxDate);
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
    <div className="space-y-3 px-4 py-3">
      <section className="space-y-1 px-1">
        <p className="text-xs font-semibold text-fawn-amber">{formatDate(new Date(), 'M月d日 EEEE')}</p>
        <h2 className="text-[20px] font-semibold leading-tight text-soft-charcoal">
          记录{summary?.baby.name ?? '宝宝'}今天的变化
        </h2>
        <p className="line-clamp-1 text-[11px] italic leading-tight text-mid-gray">
          保存后会同步到成长看板和后续对话参考。
        </p>
      </section>

      {!canWrite ? (
        <div className="rounded-card border border-warning-amber bg-warning-amber-light p-4 text-sm leading-6 text-dark-gray" role="status">
          当前账号只有查看权限，无法新增记录。请让父母或管理员账号记录，已有数据仍可在成长页查看。
        </div>
      ) : null}

      <div className="grid grid-cols-4 gap-2">
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
              aria-label={`${card.label}：${card.description}`}
              className={`min-h-[70px] rounded-2xl border bg-white px-2 py-2 text-center shadow-card transition-colors ${
                active ? 'border-fawn-amber bg-nursery-mint/40 ring-2 ring-nursery-mint' : 'border-white/70'
              }`}
            >
              <span className={`mx-auto grid h-8 w-8 place-items-center rounded-xl ${card.tint}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="mt-1 block text-[13px] font-semibold leading-tight text-soft-charcoal">{card.label}</span>
            </button>
          );
        })}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${activeCard.tint}`}>
            <ActiveIcon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-semibold leading-tight text-soft-charcoal">保存{activeCard.label}</h3>
            <p className="mt-0.5 text-xs text-dark-gray">{activeCard.description}</p>
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
                  min={minDateTime}
                  max={maxDateTime}
                  className={inputClass}
                />
              </label>
              <SegmentedChoice
                label="类型"
                ariaLabel="喂养类型"
                options={feedingTypeOptions}
                value={feeding.feed_type}
                disabled={!canWrite}
                onChange={(feedType) => setFeeding((value) => ({ ...value, feed_type: feedType }))}
              />
              <div className="grid grid-cols-1 gap-3">
                {feeding.feed_type === 'formula' ? (
                  <label className={labelClass}>
                    配方奶量 (ml)
                    <input
                      type="number"
                      min="1"
                      required
                      inputMode="numeric"
                      value={feeding.amount_ml}
                      onChange={(event) => setFeeding((value) => ({ ...value, amount_ml: event.target.value }))}
                      disabled={!canWrite}
                      className={inputClass}
                    />
                  </label>
                ) : null}
                {feeding.feed_type === 'breast' ? (
                  <label className={labelClass}>
                    亲喂时长 (分钟)
                    <input
                      type="number"
                      min="1"
                      required
                      inputMode="numeric"
                      value={feeding.duration_min}
                      onChange={(event) => setFeeding((value) => ({ ...value, duration_min: event.target.value }))}
                      disabled={!canWrite}
                      className={inputClass}
                    />
                  </label>
                ) : null}
              </div>
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
              <div className="grid grid-cols-1 gap-3">
                <label className={labelClass}>
                  开始
                  <input
                    type="datetime-local"
                    required
                    value={sleep.sleep_start}
                    onChange={(event) => setSleep((value) => ({ ...value, sleep_start: event.target.value }))}
                    disabled={!canWrite}
                    min={minDateTime}
                    max={maxDateTime}
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
                    min={minDateTime}
                    max={maxDateTime}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <SegmentedChoice
                  label="类型"
                  ariaLabel="睡眠类型"
                  options={sleepTypeOptions}
                  value={sleep.sleep_type}
                  disabled={!canWrite}
                  onChange={(sleepType) =>
                    setSleep((value) => ({
                      ...value,
                      sleep_type: sleepType,
                      night_wakings: sleepType === 'nap' ? '0' : value.night_wakings,
                    }))
                  }
                />
                {sleep.sleep_type === 'night' ? (
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
                ) : null}
              </div>
              <label className={labelClass}>
                补充说明（可选）
                <textarea
                  rows={2}
                  value={sleep.notes}
                  onChange={(event) => setSleep((value) => ({ ...value, notes: event.target.value }))}
                  disabled={!canWrite}
                  className={`${inputClass} py-3`}
                  placeholder={sleep.sleep_type === 'night' ? '例如：胀气醒、换尿布后继续睡' : '例如：入睡方式、醒来状态'}
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
                  min={birthDate}
                  max={maxDate}
                  className={inputClass}
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={labelClass} htmlFor="growth-weight">
                    体重 (g)
                  </label>
                  <input
                    id="growth-weight"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={growth.weight_g}
                    onChange={(event) => setGrowth((value) => ({ ...value, weight_g: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                  <span className={helperClass}>
                    {formatP50Hint(growthReference, growthReferenceLoading, 'weight_g', 'g')}
                  </span>
                </div>
                <div>
                  <label className={labelClass} htmlFor="growth-height">
                    身高 (cm)
                  </label>
                  <input
                    id="growth-height"
                    type="number"
                    min="1"
                    step="0.1"
                    inputMode="decimal"
                    value={growth.height_cm}
                    onChange={(event) => setGrowth((value) => ({ ...value, height_cm: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                  <span className={helperClass}>
                    {formatP50Hint(growthReference, growthReferenceLoading, 'height_cm', 'cm')}
                  </span>
                </div>
                <div>
                  <label className={labelClass} htmlFor="growth-head">
                    头围 (cm)
                  </label>
                  <input
                    id="growth-head"
                    type="number"
                    min="1"
                    step="0.1"
                    inputMode="decimal"
                    value={growth.head_cm}
                    onChange={(event) => setGrowth((value) => ({ ...value, head_cm: event.target.value }))}
                    disabled={!canWrite}
                    className={inputClass}
                  />
                  <span className={helperClass}>
                    {formatP50Hint(growthReference, growthReferenceLoading, 'head_cm', 'cm')}
                  </span>
                </div>
              </div>
              {growthReferenceUnavailable ? (
                <p className="text-[11px] italic leading-tight text-mid-gray">WHO P50 暂时不可用，可先保存实际测量值。</p>
              ) : null}
              <label className={labelClass}>
                补充说明（可选）
                <textarea
                  rows={2}
                  value={growth.notes}
                  onChange={(event) => setGrowth((value) => ({ ...value, notes: event.target.value }))}
                  disabled={!canWrite}
                  className={`${inputClass} py-3`}
                  placeholder="例如：家用软尺测量、饭后称重、复查时记录"
                />
              </label>
            </>
          ) : null}

          {activeKind === 'health' ? (
            <>
              <label className={labelClass}>
                日期
                <input
                  type="date"
                  required
                  value={health.record_date}
                  onChange={(event) => setHealth((value) => ({ ...value, record_date: event.target.value }))}
                  disabled={!canWrite}
                  min={birthDate}
                  max={maxDate}
                  className={inputClass}
                />
              </label>
              <SegmentedChoice
                label="类型"
                ariaLabel="健康类型"
                options={healthTypeOptions}
                value={health.record_type}
                columns={3}
                disabled={!canWrite}
                onChange={(recordType) => setHealth((value) => ({ ...value, record_type: recordType }))}
              />
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
