import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatClient } from '@/app/(main)/chat/ChatClient';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/chat',
}));

describe('chat page', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    useChatStore.setState({
      currentConversation: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      pendingToolCalls: [],
      conversations: [],
      searchResults: [],
      error: null,
      dataCardDraft: null,
    });
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('mama', 'password');
  });

  it('sends a message and updates the message list', async () => {
    render(<ChatClient />);
    await waitFor(() => expect(screen.getByPlaceholderText('输入消息...')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '记录喂奶' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '睡眠情况' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('输入消息...'), '宝宝今天体重4.2kg，是不是偏轻了？');
    await userEvent.click(screen.getByLabelText('发送'));
    await waitFor(() => expect(screen.getByText(/已记录今天体重/)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('生长记录')).toBeInTheDocument();
  });
});
