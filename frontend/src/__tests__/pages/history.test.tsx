import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import HistoryPage from '@/app/(main)/history/page';
import { useChatStore } from '@/lib/chat-store';

describe('history page', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    useChatStore.setState({
      conversations: [],
      searchResults: [],
      error: null,
    });
  });

  it('shows a compact back-to-chat affordance', () => {
    render(<HistoryPage />);
    expect(screen.getByRole('link', { name: /返回管家/ })).toHaveAttribute('href', '/chat');
    expect(screen.getByPlaceholderText('搜索历史对话')).toBeInTheDocument();
  });
});
