import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/(main)/dashboard/page';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard',
}));

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
    expect(screen.getByRole('button', { name: '摘要' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('喂养统计')).not.toBeInTheDocument();
    expect(screen.queryByText('睡眠统计')).not.toBeInTheDocument();
    expect(screen.queryByText('健康时间线')).not.toBeInTheDocument();
    expect(screen.getByText('最近记录')).toBeInTheDocument();
    expect(screen.getByText('体重')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /刷新/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /去记录/ })).not.toBeInTheDocument();
  });

  it('uses the approved dashboard section order and renders only the selected section', async () => {
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/晨晨/)).toBeInTheDocument(), { timeout: 2000 });

    const labels = ['摘要', '喂养', '大小便', '睡眠', '健康'];
    expect(screen.getAllByRole('button').map((button) => button.textContent).slice(0, labels.length)).toEqual(labels);

    await userEvent.click(screen.getByRole('button', { name: '喂养' }));
    expect(screen.getByText('喂养统计')).toBeInTheDocument();
    expect(screen.queryByText('今日摘要')).not.toBeInTheDocument();
    expect(screen.queryByText('最近记录')).not.toBeInTheDocument();
    expect(screen.queryByText('体重')).not.toBeInTheDocument();
    expect(screen.queryByText('睡眠统计')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '大小便' }));
    expect(screen.getByText('大小便统计')).toBeInTheDocument();
    expect(screen.getByText('大小便历史')).toBeInTheDocument();
    expect(screen.getByText('黄色软便')).toBeInTheDocument();
    expect(screen.queryByText('喂养统计')).not.toBeInTheDocument();
  });

  it('keeps available dashboard sections visible when one load source fails', async () => {
    vi.spyOn(api, 'getHealthRecords').mockRejectedValueOnce(new Error('health unavailable'));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/晨晨/)).toBeInTheDocument(), { timeout: 2000 });
    await userEvent.click(screen.getByRole('button', { name: '喂养' }));
    expect(screen.getByText('喂养统计')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/已保留可用内容/)).not.toBeInTheDocument();
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
    expect(screen.getByText('最新成长 · 暂无记录')).toBeInTheDocument();
    expect(screen.queryByText(/晨晨/)).not.toBeInTheDocument();
  });
});
