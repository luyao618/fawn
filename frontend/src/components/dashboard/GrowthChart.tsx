'use client';

import { useMemo } from 'react';
import {
  Brush,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { formatDate } from '@/lib/utils';
import type { GrowthChartData } from '@/lib/types';
import { DEFAULT_VISIBLE_DAYS, normalizeChartRange, type ChartRange, useChartRange } from './chartRange';

type Indicator = 'weight' | 'height' | 'head';

interface GrowthChartProps {
  data: GrowthChartData;
  birthDate?: string;
  activeIndicator: Indicator;
  onIndicatorChange: (indicator: Indicator) => void;
}

const labels: Record<Indicator, string> = {
  weight: '体重',
  height: '身高',
  head: '头围',
};

const units: Record<Indicator, string> = {
  weight: 'kg',
  height: 'cm',
  head: 'cm',
};

const percentileLabels = {
  p3: 'WHO P3',
  p15: 'WHO P15',
  p50: 'WHO P50',
  p85: 'WHO P85',
  p97: 'WHO P97',
} as const;
const percentileKeys = ['p97', 'p85', 'p50', 'p15', 'p3'] as const;
const referenceMergeKeys = ['p3', 'p15', 'p50', 'p85', 'p97'] as const;

const DAY_MS = 86_400_000;

type GrowthRow = {
  age_months: number;
  date_label: string;
  actual?: number | null;
  p3?: number;
  p15?: number;
  p50?: number;
  p85?: number;
  p97?: number;
};

function actualValue(record: GrowthChartData['records'][number], indicator: Indicator) {
  if (indicator === 'weight') return record.weight_g == null ? null : Number((record.weight_g / 1000).toFixed(1));
  if (indicator === 'height') return record.height_cm;
  return record.head_cm;
}

function referenceValue(value: number | undefined, indicator: Indicator) {
  if (value == null) return undefined;
  if (indicator === 'weight' && value > 100) return Number((value / 1000).toFixed(1));
  return value;
}

function ageMonths(recordDate: string, firstDate: string) {
  const days = (new Date(recordDate).getTime() - new Date(firstDate).getTime()) / DAY_MS;
  return Number((Math.max(0, days) / 30.4375).toFixed(2));
}

function ageLabel(months: number) {
  const totalDays = Math.max(0, Math.round(months * 30.4375));
  const wholeMonths = Math.floor(totalDays / 30);
  const days = totalDays % 30;
  if (wholeMonths <= 0) return `${totalDays}天`;
  if (days === 0) return `${wholeMonths}月`;
  return `${wholeMonths}月${days}天`;
}

function dateFromAgeMonths(months: number, originDate: string) {
  return new Date(new Date(originDate).getTime() + Math.round(months * 30.4375) * DAY_MS);
}

function axisLabel(months: number, originDate?: string) {
  if (!originDate) return ageLabel(months);
  return formatDate(dateFromAgeMonths(months, originDate), 'M/d');
}

function tooltipLabel(months: number, originDate?: string) {
  if (!originDate) return ageLabel(months);
  return `${formatDate(dateFromAgeMonths(months, originDate), 'M月d日')} · ${ageLabel(months)}`;
}

function sampledTicks(values: number[], maxTicks = 6) {
  const uniqueValues = Array.from(new Set(values)).sort((left, right) => left - right);
  if (uniqueValues.length <= maxTicks) return uniqueValues;

  const lastIndex = uniqueValues.length - 1;
  return Array.from({ length: maxTicks }, (_, index) => uniqueValues[Math.round((index * lastIndex) / (maxTicks - 1))]);
}

function defaultRange(rows: GrowthRow[], actualAges: number[]): ChartRange {
  if (rows.length === 0) return { startIndex: 0, endIndex: 0 };

  const latestAge = actualAges.length > 0 ? Math.max(...actualAges) : rows[rows.length - 1].age_months;
  const earliestAge = rows[0].age_months;
  const startAge = Math.max(earliestAge, latestAge - (DEFAULT_VISIBLE_DAYS - 1) / 30.4375);
  const startIndex = rows.findIndex((row) => row.age_months >= startAge);
  const endIndex = rows.findLastIndex((row) => row.age_months <= latestAge);

  return {
    startIndex: startIndex < 0 ? 0 : startIndex,
    endIndex: endIndex < 0 ? rows.length - 1 : endIndex,
  };
}

function measurementLabel(value: unknown, unit: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `-${unit}`;
  return `${numeric}${unit}`;
}

function visibleMeasurements(rows: GrowthRow[]) {
  return rows.flatMap((row) =>
    (['actual', 'p3', 'p15', 'p50', 'p85', 'p97'] as const)
      .map((key) => row[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
  );
}

function yAxisDomain(values: number[], indicator: Indicator): [number, number] | ['auto', 'auto'] {
  if (values.length === 0) return ['auto', 'auto'];

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (indicator === 'weight') {
    return [Math.max(0, Math.floor((min - 0.3) * 2) / 2), Math.ceil((max + 0.3) * 2) / 2];
  }

  return [Math.max(0, Math.floor(min - 1)), Math.ceil(max + 1)];
}

export function GrowthChart({ data, birthDate, activeIndicator, onIndicatorChange }: GrowthChartProps) {
  const reference = data.who_reference[activeIndicator];
  const unit = units[activeIndicator];
  const firstRecordDate = data.records[0]?.date;
  const originDate = birthDate ?? firstRecordDate;
  const { rows, actualAges } = useMemo(() => {
    const rowsByAge = new Map<number, GrowthRow>();
    const getRow = (age: number) => {
      const existing = rowsByAge.get(age);
      if (existing) return existing;

      const row: GrowthRow = {
        age_months: age,
        date_label: axisLabel(age, originDate),
      };
      rowsByAge.set(age, row);
      return row;
    };

    referenceMergeKeys.forEach((key) => {
      reference[key].forEach((point) => {
        const row = getRow(point.age_months);
        row[key] = referenceValue(point.value, activeIndicator);
      });
    });

    const ages = originDate
      ? data.records.map((record) => {
          const age = ageMonths(record.date, originDate);
          const row = getRow(age);
          const value = actualValue(record, activeIndicator);
          if (value != null || row.actual === undefined) row.actual = value;
          return age;
        })
      : [];

    return {
      rows: Array.from(rowsByAge.values()).sort((left, right) => left.age_months - right.age_months),
      actualAges: ages,
    };
  }, [activeIndicator, data.records, originDate, reference.p15, reference.p3, reference.p50, reference.p85, reference.p97]);
  const initialRange = useMemo(() => defaultRange(rows, actualAges), [actualAges, rows]);
  const [range, setRange] = useChartRange(initialRange);
  const selectedRows = rows.slice(range.startIndex, range.endIndex + 1);
  const selectedAges = selectedRows.map((row) => row.age_months);
  const yDomain = yAxisDomain(visibleMeasurements(selectedRows), activeIndicator);
  const xDomain: [number, number] | ['dataMin', 'dataMax'] =
    selectedAges.length > 0
      ? ([Math.min(...selectedAges), Math.max(...selectedAges)] as [number, number])
      : ['dataMin', 'dataMax'];
  const xTicks = selectedAges.length > 0 ? sampledTicks(selectedAges) : undefined;

  return (
    <section className="rounded-card border border-oat-border bg-white p-4 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-soft-charcoal">生长曲线</h2>
        <div className="flex rounded-xl bg-warm-gray p-1">
          {(Object.keys(labels) as Indicator[]).map((indicator) => (
            <button
              type="button"
              key={indicator}
              onClick={() => onIndicatorChange(indicator)}
              className={`min-h-9 rounded-lg px-3 text-sm ${
                activeIndicator === indicator ? 'bg-white text-fawn-amber shadow-card' : 'text-dark-gray'
              }`}
            >
              {labels[indicator]}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 6, bottom: 24 }}>
            <CartesianGrid stroke="#F2EDE8" vertical={false} />
            <XAxis
              type="number"
              dataKey="age_months"
              domain={xDomain}
              ticks={xTicks}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => axisLabel(Number(value), originDate)}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              width={58}
              domain={yDomain}
              tickFormatter={(value) => `${value}${unit}`}
            />
            <Tooltip
              labelFormatter={(value) => tooltipLabel(Number(value), originDate)}
              formatter={(value, name) => [measurementLabel(value, unit), name]}
              itemSorter={(item) => -Number(item.value ?? 0)}
            />
            {percentileKeys.map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={percentileLabels[key]}
                stroke="#C8C0B8"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={1}
                connectNulls
              />
            ))}
            <Line
              type="monotone"
              dataKey="actual"
              name={labels[activeIndicator]}
              stroke="#D4956A"
              strokeWidth={2.4}
              dot={{ r: 4, fill: '#D4956A' }}
              connectNulls
            />
            <Brush
              dataKey="date_label"
              startIndex={range.startIndex}
              endIndex={range.endIndex}
              onChange={(nextRange) => setRange(normalizeChartRange(nextRange, rows.length))}
              height={22}
              travellerWidth={8}
              stroke="#D4956A"
              fill="#FBF8F4"
              tickFormatter={() => ''}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] italic leading-tight text-mid-gray">
        WHO 参考线为灰色虚线
      </p>
    </section>
  );
}
