import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import RecordPage from '@/app/(main)/record/page';
import { TabBar } from '@/components/layout/TabBar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

describe('record page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('mama', 'password');
  });

  it('renders the five main navigation tabs', () => {
    render(<TabBar currentPath="/record" />);

    expect(screen.getByRole('link', { name: /管家/ })).toHaveAttribute('href', '/chat');
    expect(screen.getByRole('link', { name: /成长/ })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /记录/ })).toHaveAttribute('href', '/record');
    expect(screen.getByRole('link', { name: /相册/ })).toHaveAttribute('href', '/album');
    expect(screen.getByRole('link', { name: /家庭/ })).toHaveAttribute('href', '/profile');
  });

  it('creates a feeding record from the quick form', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.type(screen.getByLabelText('奶量 (ml)'), '90');
    await userEvent.click(screen.getByRole('button', { name: '保存喂养' }));

    await waitFor(() => expect(screen.getByText(/喂养已保存/)).toBeInTheDocument());
    expect((await api.getFeedingRecords()).some((record) => record.amount_ml === 90)).toBe(true);
  });

  it('disables submission for users without tracker write permission', async () => {
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('nainai', 'password');

    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('当前账号只有查看权限'));
    expect(screen.getByRole('button', { name: '保存喂养' })).toBeDisabled();
  });
});
