import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecordPage from '@/app/(main)/record/page';
import { TabBar } from '@/components/layout/TabBar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/record',
}));

describe('record page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    mockSearchParams = new URLSearchParams();
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
    await userEvent.type(screen.getByLabelText('配方奶量 (ml)'), '90');
    await userEvent.click(screen.getByRole('button', { name: '保存喂养' }));

    await waitFor(() => expect(screen.getByText(/喂养已保存/)).toBeInTheDocument());
    expect((await api.getFeedingRecords()).some((record) => record.amount_ml === 90)).toBe(true);
  });

  it('uses large feeding type buttons instead of a native select', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/记录晨晨今天的变化/)).toBeInTheDocument());

    expect(screen.getByLabelText('时间')).toHaveAttribute('min', '2026-03-01T00:00');

    const group = screen.getByRole('group', { name: '喂养类型' });
    expect(screen.queryByRole('combobox', { name: '类型' })).not.toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: '辅食' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '配方奶' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(group).getByRole('button', { name: '母乳' }));

    expect(within(group).getByRole('button', { name: '母乳' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('亲喂时长 (分钟)')).toBeInTheDocument();
  });

  it('uses full-width sleep time fields and sleep type buttons', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /睡眠：/ }));

    expect(screen.getByRole('button', { name: '保存睡眠' })).toBeInTheDocument();
    expect(screen.getByLabelText('开始')).toHaveAttribute('type', 'datetime-local');
    expect(screen.getByLabelText('结束')).toHaveAttribute('type', 'datetime-local');

    const group = screen.getByRole('group', { name: '睡眠类型' });
    expect(screen.queryByRole('combobox', { name: '类型' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '小睡' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('夜醒次数')).not.toBeInTheDocument();

    await userEvent.click(within(group).getByRole('button', { name: '夜睡' }));

    expect(within(group).getByRole('button', { name: '夜睡' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('夜醒次数')).toBeInTheDocument();
  });

  it('submits nap records with zero night wakings', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /睡眠：/ }));

    expect(screen.queryByLabelText('夜醒次数')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('补充说明（可选）'), '午睡测试记录');
    await userEvent.click(screen.getByRole('button', { name: '保存睡眠' }));

    await waitFor(() => expect(screen.getByText(/睡眠已保存/)).toBeInTheDocument());
    expect(
      (await api.getSleepRecords()).some(
        (record) => record.notes === '午睡测试记录' && record.sleep_type === 'nap' && record.night_wakings === 0,
      ),
    ).toBe(true);
  });

  it('blocks sleep records when the end is before the start', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /睡眠：/ }));

    fireEvent.change(screen.getByLabelText('开始'), { target: { value: '2026-05-02T10:00' } });
    fireEvent.change(screen.getByLabelText('结束'), { target: { value: '2026-05-02T09:00' } });
    await userEvent.click(screen.getByRole('button', { name: '保存睡眠' }));

    await waitFor(() => expect(screen.getByText('睡眠结束时间必须晚于开始时间')).toBeInTheDocument());
  });

  it('shows compact growth P50 hints and saves optional notes', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /生长：/ }));

    await waitFor(() => expect(screen.getAllByText(/P50/).length).toBeGreaterThanOrEqual(3));
    expect(screen.getByLabelText('补充说明（可选）')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('spinbutton', { name: /体重/ }), '4300');
    await userEvent.type(screen.getByLabelText('补充说明（可选）'), '家用软尺测量');
    await userEvent.click(screen.getByRole('button', { name: '保存生长' }));

    await waitFor(() => expect(screen.getByText(/生长已保存/)).toBeInTheDocument());
    expect(
      (await api.getGrowthRecords()).some(
        (record) => record.weight_g === 4300 && record.notes === '家用软尺测量',
      ),
    ).toBe(true);
  });

  it('uses health type buttons instead of a native select', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /健康：/ }));

    expect(screen.getByRole('button', { name: '保存健康' })).toBeInTheDocument();
    const group = screen.getByRole('group', { name: '健康类型' });
    expect(screen.queryByRole('combobox', { name: '类型' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '体检' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(group).getByRole('button', { name: '疫苗' }));

    expect(within(group).getByRole('button', { name: '疫苗' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables submission for users without tracker write permission', async () => {
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('doctor', 'password');

    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('当前账号只有查看权限'));
    expect(screen.getByRole('button', { name: '保存喂养' })).toBeDisabled();
  });

  it('disables save and links to profile when no baby exists', async () => {
    await api.registerFamily({
      invite_code: '2026',
      family_name: 'Record 空宝宝家庭',
      username: 'record-empty-baby',
      password: 'secret123',
      display_name: 'Record 爸爸',
      role: '爸爸',
    });
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('record-empty-baby', 'secret123');

    render(<RecordPage />);

    await waitFor(() => expect(screen.getByText('还没有宝宝档案，暂时不能保存记录。')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '去家庭页' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: '保存喂养' })).toBeDisabled();
  });

  it('shows growth history list when growth tab is active', async () => {
    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /生长：/ }));

    await waitFor(() => expect(screen.getByText('成长记录历史')).toBeInTheDocument());
  });

  it('initializes growth tab when ?kind=growth is in the URL', async () => {
    mockSearchParams = new URLSearchParams('kind=growth');

    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存生长' })).toBeInTheDocument());
  });

  it('falls back to feeding tab for invalid ?kind= param', async () => {
    mockSearchParams = new URLSearchParams('kind=invalid');

    render(<RecordPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '保存喂养' })).toBeInTheDocument());
  });
});
