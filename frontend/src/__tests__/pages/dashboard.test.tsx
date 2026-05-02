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
    expect(screen.getByRole('button', { name: /刷新/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /去记录/ })).not.toBeInTheDocument();
  });

  it('keeps available dashboard sections visible when one refresh source fails', async () => {
    vi.spyOn(api, 'getHealthRecords').mockRejectedValueOnce(new Error('health unavailable'));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/晨晨/)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('生长曲线')).toBeInTheDocument();
    expect(screen.getByText('喂养统计')).toBeInTheDocument();
    expect(screen.getByText('睡眠统计')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('有 1 项数据暂时没更新');
  });
});
