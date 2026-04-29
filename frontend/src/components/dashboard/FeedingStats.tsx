'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';
import type { FeedingStatsData } from '@/lib/types';

export function FeedingStats({ data }: { data: FeedingStatsData }) {
  return (
    <Card>
      <p className="text-sm text-dark-gray">喂养统计</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="font-mono text-[28px] font-bold leading-tight">{data.average_daily_ml}</p>
          <p className="text-sm text-dark-gray">日均 ml</p>
        </div>
        <div>
          <p className="font-mono text-[28px] font-bold leading-tight">{data.average_daily_count.toFixed(1)}</p>
          <p className="text-sm text-dark-gray">日均次数</p>
        </div>
      </div>
      <div className="mt-4 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.daily}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(date) => formatDate(String(date), 'M/d')} />
            <YAxis hide />
            <Tooltip />
            <Bar dataKey="total_ml" fill="#D4956A" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
