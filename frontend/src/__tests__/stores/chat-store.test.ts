import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { createMockSSEResponse } from '@/lib/sse';

function resetChat() {
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
}

describe('chat-store', () => {
  beforeEach(async () => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    vi.restoreAllMocks();
    window.localStorage.clear();
    resetChat();
    useAuthStore.getState().logout();
    await useAuthStore.getState().login('mama', 'password');
  });

  it('sends a message through SSE and appends user plus assistant messages', async () => {
    await useChatStore.getState().sendMessage('宝宝今天体重4.2kg，是不是偏轻了？');
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[1].message_type).toBe('data_card');
  });

  it('tracks tool calls and clears them on tool_result', () => {
    useChatStore.getState().handleSSEEvent({ type: 'tool_call', name: 'record_growth', args: {} });
    expect(useChatStore.getState().pendingToolCalls).toContain('record_growth');
    useChatStore.getState().handleSSEEvent({
      type: 'tool_result',
      name: 'record_growth',
      result: { type: 'growth', weight_g: 4200 },
    });
    expect(useChatStore.getState().pendingToolCalls).toHaveLength(0);
    expect(useChatStore.getState().dataCardDraft?.type).toBe('growth');
  });

  it('automatically creates a new conversation and resends after session_expired', async () => {
    const send = vi
      .spyOn(api, 'sendMessage')
      .mockResolvedValueOnce(
        createMockSSEResponse([{ type: 'session_expired', expired_conversation_id: 'conv-old' }], 1),
      )
      .mockResolvedValueOnce(
        createMockSSEResponse(
          [
            { type: 'token', content: '重新发送成功' },
            { type: 'done', message_id: 'msg-new', message_type: 'text' },
          ],
          1,
        ),
      );

    await useChatStore.getState().sendMessage('测试重发');
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
    expect(send).toHaveBeenCalledTimes(2);
    expect(useChatStore.getState().messages.at(-1)?.content).toBe('重新发送成功');
  });

  it('recovers input state after SSE errors and network failures', async () => {
    vi.spyOn(api, 'sendMessage').mockResolvedValueOnce(
      createMockSSEResponse([{ type: 'error', message: '后端错误' }], 1),
    );
    await useChatStore.getState().sendMessage('触发错误');
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
    expect(useChatStore.getState().error).toBe('后端错误');

    vi.spyOn(api, 'sendMessage').mockRejectedValueOnce(new Error('network down'));
    await useChatStore.getState().sendMessage('网络失败');
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));
    expect(useChatStore.getState().error).toBe('network down');
  });
});
