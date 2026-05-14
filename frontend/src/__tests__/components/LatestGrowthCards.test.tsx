import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LatestGrowthCards } from '@/components/dashboard/LatestGrowthCards';
import type { DashboardLatestGrowth } from '@/lib/types';

const fullLatest: DashboardLatestGrowth = {
  weight: { date: '2026-04-29', value: 4200, percentile: 35 },
  height: { date: '2026-04-29', value: 55, percentile: 45 },
  head: { date: '2026-04-28', value: 38, percentile: 50 },
};

const weightOnlyLatest: DashboardLatestGrowth = {
  weight: { date: '2026-04-29', value: 4200, percentile: 35 },
  height: null,
  head: null,
};

describe('LatestGrowthCards', () => {
  it('renders all three metrics inline when present', () => {
    render(<LatestGrowthCards latest={fullLatest} />);

    expect(screen.getByText('体重')).toBeInTheDocument();
    expect(screen.getByText('身高')).toBeInTheDocument();
    expect(screen.getByText('头围')).toBeInTheDocument();
    expect(screen.getByText('4.20kg')).toBeInTheDocument();
    expect(screen.getByText('55cm')).toBeInTheDocument();
    expect(screen.getByText('38cm')).toBeInTheDocument();
    expect(screen.getByText('P35')).toBeInTheDocument();
  });

  it('shows -- placeholder for missing metrics', () => {
    render(<LatestGrowthCards latest={weightOnlyLatest} />);

    expect(screen.getByText('4.20kg')).toBeInTheDocument();
    expect(screen.getAllByText('--')).toHaveLength(2);
  });

  it('shows compact empty state when latest is null', () => {
    render(<LatestGrowthCards latest={null} />);

    expect(screen.getByText('最新成长 · 暂无记录')).toBeInTheDocument();
  });
});
