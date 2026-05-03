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

  it('loads photos with compact album controls', async () => {
    render(<AlbumPage />);

    await waitFor(() => expect(screen.getByText('按时间、场景和里程碑浏览')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '时间线' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '场景' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '里程碑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '场景' }));
    await waitFor(() => expect(screen.getByText('客厅')).toBeInTheDocument());
  });

  it('shows download and delete actions for parents', async () => {
    const user = userEvent.setup();
    render(<AlbumPage />);

    const photoButtons = await screen.findAllByRole('button', { name: /查看照片：/ });
    await user.click(photoButtons[0]);

    expect(screen.getByRole('button', { name: '下载照片' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除照片' })).toBeInTheDocument();
  });

  it('shows delete action for family members', async () => {
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('nainai', 'password');

    const user = userEvent.setup();
    render(<AlbumPage />);

    const photoButtons = await screen.findAllByRole('button', { name: /查看照片：/ });
    await user.click(photoButtons[0]);

    expect(screen.getByRole('button', { name: '下载照片' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除照片' })).toBeInTheDocument();
  });

  it('hides delete action for friends', async () => {
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('doctor', 'password');

    const user = userEvent.setup();
    render(<AlbumPage />);

    const photoButtons = await screen.findAllByRole('button', { name: /查看照片：/ });
    await user.click(photoButtons[0]);

    expect(screen.getByRole('button', { name: '下载照片' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除照片' })).not.toBeInTheDocument();
  });
});
