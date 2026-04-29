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

  it('redirects unauthenticated main routes to /login', async () => {
    render(
      <AuthGuard>
        <div>受保护内容</div>
      </AuthGuard>,
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login?next=%2Fchat'));
  });
});
