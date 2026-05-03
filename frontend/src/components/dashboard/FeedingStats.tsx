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
import type { FeedingStatsData } from '@/lib/types';
import { defaultIndexRange, normalizeChartRange, useChartRange } from './chartRange';

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function FeedingStats({ data }: { data: FeedingStatsData }) {
  const initialRange = useMemo(() => defaultIndexRange(data.daily.length), [data.daily.length]);
  const [range, setRange] = useChartRange(initialRange);
  const selectedRows = data.daily.slice(range.startIndex, range.endIndex + 1);
  const averageDailyMl = average(selectedRows.map((row) => row.total_ml));
  const averageDailyBreastDuration = average(selectedRows.map((row) => row.breast_duration_min));
  const averageDailyCount = average(selectedRows.map((row) => row.count));

  return (
    <Card>
      <p className="text-sm text-dark-gray">喂养统计</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{Math.round(averageDailyMl)}</p>
          <p className="text-xs text-dark-gray">日均配方奶 ml</p>
        </div>
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{Math.round(averageDailyBreastDuration)}</p>
          <p className="text-xs text-dark-gray">日均亲喂分钟</p>
        </div>
        <div>
          <p className="font-mono text-[24px] font-bold leading-tight">{averageDailyCount.toFixed(1)}</p>
          <p className="text-xs text-dark-gray">日均次数</p>
        </div>
      </div>
      <div className="mt-4 h-56 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.daily} margin={{ top: 8, right: 4, left: 4, bottom: 24 }}>
            <CartesianGrid stroke="#F2EDE8" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11 }}
              tickFormatter={(date) => formatDate(String(date), 'M/d')}
              minTickGap={12}
            />
            <YAxis yAxisId="amount" tick={{ fontSize: 11 }} width={52} tickFormatter={(value) => `${value}ml`} />
            <YAxis
              yAxisId="duration"
              orientation="right"
              tick={{ fontSize: 11 }}
              width={42}
              allowDecimals={false}
              tickFormatter={(value) => `${value}分`}
            />
            <YAxis yAxisId="count" hide allowDecimals={false} />
            <Tooltip
              labelFormatter={(date) => formatDate(String(date), 'M月d日')}
              formatter={(value, name) => {
                if (name === '配方奶量') return [`${value}ml`, name];
                if (name === '亲喂时长') return [`${value}分钟`, name];
                return [`${value}次`, name];
              }}
            />
            <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="amount" dataKey="total_ml" name="配方奶量" fill="#D4956A" radius={[6, 6, 0, 0]} />
            <Line
              yAxisId="duration"
              type="monotone"
              dataKey="breast_duration_min"
              name="亲喂时长"
              stroke="#8BAFD6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#8BAFD6' }}
            />
            <Line
              yAxisId="count"
              type="monotone"
              dataKey="count"
              name="次数"
              stroke="#6BAF8D"
              strokeWidth={2}
              dot={{ r: 3, fill: '#6BAF8D' }}
            />
            <Brush
              dataKey="date"
              startIndex={range.startIndex}
              endIndex={range.endIndex}
              onChange={(nextRange) => setRange(normalizeChartRange(nextRange, data.daily.length))}
              height={22}
              travellerWidth={8}
              stroke="#D4956A"
              fill="#FBF8F4"
              tickFormatter={() => ''}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
