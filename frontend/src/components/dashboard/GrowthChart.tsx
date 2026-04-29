'use client';

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { GrowthChartData } from '@/lib/types';

type Indicator = 'weight' | 'height' | 'head';

interface GrowthChartProps {
  data: GrowthChartData;
  activeIndicator: Indicator;
  onIndicatorChange: (indicator: Indicator) => void;
}

const labels: Record<Indicator, string> = {
  weight: '体重',
  height: '身高',
  head: '头围',
};

function actualValue(record: GrowthChartData['records'][number], indicator: Indicator) {
  if (indicator === 'weight') return record.weight_g == null ? null : Number((record.weight_g / 1000).toFixed(1));
  if (indicator === 'height') return record.height_cm;
  return record.head_cm;
}

export function GrowthChart({ data, activeIndicator, onIndicatorChange }: GrowthChartProps) {
  const reference = data.who_reference[activeIndicator];
  const rows = reference.p50.map((point, index) => {
    const record = data.records[index];
    return {
      age_months: point.age_months,
      p3: reference.p3[index]?.value,
      p15: reference.p15[index]?.value,
      p50: reference.p50[index]?.value,
      p85: reference.p85[index]?.value,
      p97: reference.p97[index]?.value,
      actual: record ? actualValue(record, activeIndicator) : null,
    };
  });

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
      <div className="h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#F2EDE8" vertical={false} />
            <XAxis dataKey="age_months" tick={{ fontSize: 12 }} tickFormatter={(value) => `${value}月`} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip labelFormatter={(value) => `${value}个月`} />
            {(['p3', 'p15', 'p50', 'p85', 'p97'] as const).map((key) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke="#C8C0B8"
                strokeDasharray="4 4"
                dot={false}
                strokeWidth={1}
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
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-dark-gray">
        WHO 参考线为灰色虚线
      </p>
    </section>
  );
}
