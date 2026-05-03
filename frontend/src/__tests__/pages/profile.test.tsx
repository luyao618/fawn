import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '@/app/(main)/profile/page';
import { useAuthStore } from '@/lib/auth-store';

const nav = {
  replace: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
}));

describe('profile page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    nav.replace.mockClear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('admin', 'password');
  });

  it('loads family, privacy, baby profile, and memory sections', async () => {
    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('晨晨的家庭')).toBeInTheDocument());
    expect(screen.queryByText('当前家庭')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改家庭名称' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修改密码' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登出账户' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('宝宝档案')).toBeInTheDocument());
    expect(screen.getByText('账号与权限')).toBeInTheDocument();
    expect(screen.getByText('家庭记忆')).toBeInTheDocument();
    expect(screen.getByText('我的画像')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('@nainai')).toBeInTheDocument());
  });

  it('opens account editing in a compact member dialog', async () => {
    render(<ProfilePage />);

    await userEvent.click(await screen.findByRole('button', { name: '编辑奶奶' }));

    expect(screen.getByRole('dialog', { name: '编辑账号' })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('奶奶')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /家人/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByPlaceholderText('不修改可留空')).toBeInTheDocument();
  });

  it('opens account creation in a dialog instead of inline fields', async () => {
    render(<ProfilePage />);

    await userEvent.click(await screen.findByRole('button', { name: '新增' }));

    expect(screen.getByRole('dialog', { name: '新增账号' })).toBeInTheDocument();
    expect(screen.getByText('初始密码')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /家人/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('opens family, baby, and permission help dialogs from compact actions', async () => {
    render(<ProfilePage />);

    await userEvent.click(await screen.findByRole('button', { name: '修改家庭名称' }));
    expect(screen.getByRole('dialog', { name: '修改家庭名称' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await userEvent.click(screen.getByRole('button', { name: '修改宝宝档案' }));
    expect(screen.getByRole('dialog', { name: '修改宝宝档案' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await userEvent.click(screen.getByRole('button', { name: '查看权限说明' }));
    expect(screen.getByRole('dialog', { name: '权限说明' })).toBeInTheDocument();
  });

  it('logs out from the family summary card', async () => {
    render(<ProfilePage />);

    await userEvent.click(await screen.findByRole('button', { name: '登出账户' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(nav.replace).toHaveBeenCalledWith('/login');
  });
});
