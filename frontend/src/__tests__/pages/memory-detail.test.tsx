import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemoryFilePage from '@/app/(main)/profile/memory/[memoryId]/page';
import { useAuthStore } from '@/lib/auth-store';

const nav = {
  push: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useParams: () => ({ memoryId: 'baby' }),
  useRouter: () => nav,
}));

describe('memory detail page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    nav.push.mockClear();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('admin', 'password');
  });

  it('renders markdown preview and saves parent edits', async () => {
    render(<MemoryFilePage />);

    await waitFor(() => expect(screen.getByText('Baby')).toBeInTheDocument());
    expect(screen.queryByText('Baby.md')).not.toBeInTheDocument();
    expect(screen.getByText('结构化宝宝档案')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '编辑记忆' }));
    const editor = screen.getByRole('textbox');
    await userEvent.clear(editor);
    await userEvent.type(editor, '## 宝宝记忆\n喜欢安静入睡');
    await userEvent.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => expect(screen.getByText('喜欢安静入睡')).toBeInTheDocument());
    expect(screen.getByText('结构化宝宝档案')).toBeInTheDocument();
  });

  it('returns to family tab from the header action', async () => {
    render(<MemoryFilePage />);

    await userEvent.click(await screen.findByRole('button', { name: '返回家庭' }));

    expect(nav.push).toHaveBeenCalledWith('/profile');
  });
});
