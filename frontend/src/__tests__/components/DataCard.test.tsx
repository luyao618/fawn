import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataCard } from '@/components/chat/DataCard';

describe('DataCard', () => {
  it.each([
    ['growth', '生长记录', { weight_g: 4200, height_cm: 55, weight_percentile: 35 }],
    ['feeding', '喂养统计', { total_ml: 480, count: 6, last_feed_time: '14:20' }],
    ['sleep', '睡眠统计', { total_hours: 12, night_wakings: 2 }],
    ['health', '健康事件', { title: '满月体检', description: '正常' }],
  ] as const)('renders %s card', (type, title, data) => {
    render(<DataCard type={type} data={data} />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
