import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
  it('renders all three metrics when all data is present', () => {
    render(<LatestGrowthCards latest={fullLatest} referenceP50={null} onViewAll={() => {}} />);

    expect(screen.getByText('体重')).toBeInTheDocument();
    expect(screen.getByText('身高')).toBeInTheDocument();
    expect(screen.getByText('头围')).toBeInTheDocument();
    expect(screen.getByText('4.20kg')).toBeInTheDocument();
    expect(screen.getByText('55cm')).toBeInTheDocument();
    expect(screen.getByText('38cm')).toBeInTheDocument();
  });

  it('shows 尚未记录 for height and head when only weight is present', () => {
    render(<LatestGrowthCards latest={weightOnlyLatest} referenceP50={null} onViewAll={() => {}} />);

    expect(screen.getByText('4.20kg')).toBeInTheDocument();
    expect(screen.getAllByText('尚未记录')).toHaveLength(2);
  });

  it('shows empty state when latest is null', () => {
    render(<LatestGrowthCards latest={null} referenceP50={null} onViewAll={() => {}} />);

    expect(screen.getByText('暂无成长记录')).toBeInTheDocument();
  });

  it('calls onViewAll when the button is clicked', async () => {
    const onViewAll = vi.fn();
    render(<LatestGrowthCards latest={fullLatest} referenceP50={null} onViewAll={onViewAll} />);

    await userEvent.click(screen.getByRole('button', { name: /查看全部成长记录/ }));

    expect(onViewAll).toHaveBeenCalledOnce();
  });
});
