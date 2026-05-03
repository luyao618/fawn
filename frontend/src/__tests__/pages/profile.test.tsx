import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import ProfilePage from '@/app/(main)/profile/page';
import { useAuthStore } from '@/lib/auth-store';

describe('profile page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('admin', 'password');
  });

  it('loads family, privacy, baby profile, and memory sections', async () => {
    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByText('晨晨的家庭')).toBeInTheDocument());
    expect(screen.getByText('家庭数据边界')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('宝宝档案')).toBeInTheDocument());
    expect(screen.getByText('账号与权限')).toBeInTheDocument();
    expect(screen.getByText('家庭记忆')).toBeInTheDocument();
    expect(screen.getByText('我的画像')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('奶奶')).toBeInTheDocument());
  });
});
