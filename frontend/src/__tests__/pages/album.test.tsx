import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AlbumPage from '@/app/(main)/album/page';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

describe('album page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('mama', 'password');
  });

  it('loads photos with compact album controls', async () => {
    const getPhotos = vi.spyOn(api, 'getPhotos');
    render(<AlbumPage />);

    await waitFor(() => expect(screen.getByText('按拍摄时间浏览')).toBeInTheDocument());
    expect(getPhotos).toHaveBeenCalledWith();
    expect(screen.queryByRole('button', { name: '时间线' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '场景' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '里程碑' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /上传/ })).toBeInTheDocument();

    expect((await screen.findAllByText('2026年4月28日')).length).toBeGreaterThan(0);
    expect(screen.queryByText('2026年4月28日 · 1个月27天')).not.toBeInTheDocument();
    expect(screen.queryByText('客厅')).not.toBeInTheDocument();
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

  it('shows upload error when no baby exists', async () => {
    await api.registerFamily({
      invite_code: '2026',
      family_name: 'Album 空宝宝家庭',
      username: 'album-empty-baby',
      password: 'secret123',
      display_name: 'Album 妈妈',
      role: '妈妈',
    });
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('album-empty-baby', 'secret123');

    const { container } = render(<AlbumPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['fake image'], 'test.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText('请先在家庭页创建宝宝档案')).toBeInTheDocument());
  });
});
