import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(main)/dashboard/page';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

describe('dashboard page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    vi.restoreAllMocks();
    window.localStorage.clear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('mama', 'password');
  });

  it('loads dashboard mock data', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/晨晨/)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('生长曲线')).toBeInTheDocument();
    expect(screen.getByText('喂养统计')).toBeInTheDocument();
    expect(screen.getByText('睡眠统计')).toBeInTheDocument();
    expect(screen.getByText('健康时间线')).toBeInTheDocument();
    expect(screen.getByText('最近记录')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /刷新/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /去记录/ })).not.toBeInTheDocument();
  });

  it('keeps available dashboard sections visible when one load source fails', async () => {
    vi.spyOn(api, 'getHealthRecords').mockRejectedValueOnce(new Error('health unavailable'));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/晨晨/)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('生长曲线')).toBeInTheDocument();
    expect(screen.getByText('喂养统计')).toBeInTheDocument();
    expect(screen.getByText('睡眠统计')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('有 1 项数据暂时没更新');
  });

  it('renders setup state without fake baby data for registered empty families', async () => {
    await api.registerFamily({
      invite_code: '2026',
      family_name: 'Dashboard 空宝宝家庭',
      username: 'dashboard-empty-baby',
      password: 'secret123',
      display_name: 'Dashboard 妈妈',
      role: '妈妈',
    });
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('dashboard-empty-baby', 'secret123');

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('还没有宝宝档案')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '去家庭页' })).toHaveAttribute('href', '/profile');
    expect(screen.getByText('暂无生长记录')).toBeInTheDocument();
    expect(screen.queryByText(/晨晨/)).not.toBeInTheDocument();
  });
});
