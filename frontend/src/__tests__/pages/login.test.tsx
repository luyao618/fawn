import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuthStore } from '@/lib/auth-store';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/chat',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => nav.pathname,
}));

describe('login and auth routing', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    nav.replace.mockClear();
    nav.push.mockClear();
    useAuthStore.getState().logout();
  });

  it('logs in and redirects to /chat', async () => {
    render(<LoginPage />);
    await userEvent.clear(screen.getByLabelText('密码', { selector: 'input' }));
    await userEvent.type(screen.getByLabelText('密码', { selector: 'input' }), 'password');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/chat'));
  });

  it('registers with an invite code then logs in to /profile', async () => {
    render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: '注册账号' }));
    await userEvent.type(screen.getByLabelText('邀请码'), '2026');
    await userEvent.type(screen.getByLabelText('家庭名称'), '登录页新家庭');
    await userEvent.type(screen.getByLabelText('昵称'), '新妈妈');
    await userEvent.click(screen.getByRole('button', { name: '妈妈' }));
    await userEvent.type(screen.getByLabelText('账号名'), 'registered-login');
    await userEvent.type(screen.getByLabelText('密码', { selector: 'input[autocomplete="new-password"]' }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(screen.getByText('注册成功，请使用新账号登录。')).toBeInTheDocument());
    expect(window.localStorage.getItem('access_token')).toBeNull();

    await userEvent.type(screen.getByLabelText('密码', { selector: 'input[autocomplete="current-password"]' }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/profile'));
  });

  it('shows invite errors on registration', async () => {
    render(<LoginPage />);

    await userEvent.click(screen.getByRole('button', { name: '注册账号' }));
    await userEvent.type(screen.getByLabelText('邀请码'), 'bad');
    await userEvent.type(screen.getByLabelText('家庭名称'), '错误邀请码家庭');
    await userEvent.type(screen.getByLabelText('昵称'), '新爸爸');
    await userEvent.type(screen.getByLabelText('账号名'), 'bad-invite-login');
    await userEvent.type(screen.getByLabelText('密码', { selector: 'input[autocomplete="new-password"]' }), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => expect(screen.getByText('邀请码不正确')).toBeInTheDocument());
  });

  it('redirects unauthenticated main routes to /login', async () => {
    render(
      <AuthGuard>
        <div>受保护内容</div>
      </AuthGuard>,
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fchat'));
  });
});
