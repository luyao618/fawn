'use client';

import { useMemo } from 'react';
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';
import type { SleepStatsData } from '@/lib/types';
import { defaultIndexRange, normalizeChartRange, useChartRange } from './chartRange';

function average(values: Array<number | null | undefined>) {
  const numericValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

export function SleepStats({ data }: { data: SleepStatsData }) {
  const initialRange = useMemo(() => defaultIndexRange(data.daily.length), [data.daily.length]);
  const [range, setRange] = useChartRange(initialRange);
  const selectedRows = data.daily.slice(range.startIndex, range.endIndex + 1);
  const averageDailyHours = average(selectedRows.map((row) => row.total_hours));
  const averageNightWakings = average(selectedRows.map((row) => row.night_wakings));
  const hasSelectedData = selectedRows.some((row) => row.total_hours != null || row.night_wakings != null);

  return (
    <Card>
      <p className="text-sm text-dark-gray">睡眠统计</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="font-mono text-[28px] font-bold leading-tight">
            {averageDailyHours == null ? '没数据' : averageDailyHours.toFixed(1)}
          </p>
          <p className="text-sm text-dark-gray">日均小时</p>
        </div>
        <div>
          <p className="font-mono text-[28px] font-bold leading-tight">
            {averageNightWakings == null ? '没数据' : averageNightWakings.toFixed(1)}
          </p>
          <p className="text-sm text-dark-gray">平均夜醒</p>
        </div>
      </div>
      <div className="relative mt-4 h-48 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.daily} margin={{ top: 8, right: 4, left: 4, bottom: 24 }}>
            <CartesianGrid stroke="#F2EDE8" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(date) => formatDate(String(date), 'M/d')}
              minTickGap={12}
            />
            <YAxis yAxisId="hours" tick={{ fontSize: 11 }} width={52} tickFormatter={(value) => `${value}h`} />
            <YAxis
              yAxisId="wakings"
              orientation="right"
              tick={{ fontSize: 11 }}
              width={34}
              allowDecimals={false}
              tickFormatter={(value) => `${value}次`}
            />
            <Tooltip
              labelFormatter={(date) => formatDate(String(date), 'M月d日')}
              formatter={(value, name) => {
                if (name === '睡眠') return [`${value}h`, name];
                return [`${value}次`, name];
              }}
            />
            <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="hours" dataKey="total_hours" name="睡眠" fill="#8DA8C8" radius={[6, 6, 0, 0]} />
            <Line
              yAxisId="wakings"
              type="monotone"
              dataKey="night_wakings"
              name="夜醒"
              stroke="#D4956A"
              strokeWidth={2}
              dot={{ r: 3, fill: '#D4956A' }}
            />
            <Brush
              dataKey="date"
              startIndex={range.startIndex}
              endIndex={range.endIndex}
              onChange={(nextRange) => setRange(normalizeChartRange(nextRange, data.daily.length))}
              height={22}
              travellerWidth={8}
              stroke="#8DA8C8"
              fill="#F5F8F3"
              tickFormatter={() => ''}
            />
          </ComposedChart>
        </ResponsiveContainer>
        {!hasSelectedData ? (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-mid-gray">
            这段时间暂无睡眠记录
          </div>
        ) : null}
      </div>
    </Card>
  );
}
