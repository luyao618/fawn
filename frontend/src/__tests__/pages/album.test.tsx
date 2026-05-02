import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import AlbumPage from '@/app/(main)/album/page';
import { useAuthStore } from '@/lib/auth-store';

describe('album page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('mama', 'password');
  });

  it('loads photos with insight banner and view controls', async () => {
    render(<AlbumPage />);

    await waitFor(() => expect(screen.getByText('智慧相册')).toBeInTheDocument());
    expect(screen.getByText('自动整理场景、表情和里程碑')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '时间线' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '场景' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '里程碑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '场景' }));
    await waitFor(() => expect(screen.getByText('客厅')).toBeInTheDocument());
  });
});
