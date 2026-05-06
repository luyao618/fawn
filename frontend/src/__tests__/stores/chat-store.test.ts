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

  it('clears stale conversation state when the authenticated family changes', async () => {
    const staleConversation = {
      id: 'conv-old-family',
      started_at: '2026-04-29T07:40:00+08:00',
      ended_at: null,
      is_active: true,
      summary: '旧家庭对话',
      message_count: 1,
    };
    useChatStore.setState({
      currentConversation: staleConversation,
      conversations: [staleConversation],
      messages: [
        {
          id: 'msg-old-family',
          conversation_id: staleConversation.id,
          role: 'assistant',
          content: '旧家庭消息',
          message_type: 'text',
          metadata: null,
          created_at: '2026-04-29T07:40:00+08:00',
        },
      ],
      error: '旧错误',
    });
    const suffix = Date.now();
    await api.registerFamily({
      invite_code: '2026',
      family_name: `聊天隔离家庭 ${suffix}`,
      username: `chat-switch-${suffix}`,
      password: 'secret123',
      display_name: '新妈妈',
      role: '妈妈',
    });

    await useAuthStore.getState().login(`chat-switch-${suffix}`, 'secret123');

    expect(useChatStore.getState().currentConversation).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().conversations).toEqual([]);
    expect(useChatStore.getState().error).toBeNull();
  });

  it('clears stale current conversation when the loaded family list does not include it', async () => {
    const staleConversation = {
      id: 'conv-stale',
      started_at: '2026-04-29T07:40:00+08:00',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 1,
    };
    useChatStore.setState({
      currentConversation: staleConversation,
      conversations: [staleConversation],
      messages: [
        {
          id: 'msg-stale',
          conversation_id: staleConversation.id,
          role: 'assistant',
          content: '旧消息',
          message_type: 'text',
          metadata: null,
          created_at: '2026-04-29T07:40:00+08:00',
        },
      ],
    });
    vi.spyOn(api, 'getConversations').mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });

    await useChatStore.getState().loadConversations();

    expect(useChatStore.getState().currentConversation).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().conversations).toEqual([]);
  });

  it('creates a fresh conversation and retries once when the current conversation is missing', async () => {
    const staleConversation = {
      id: 'conv-stale-send',
      started_at: '2026-04-29T07:40:00+08:00',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 1,
    };
    const freshConversation = {
      id: 'conv-fresh-send',
      started_at: '2026-04-29T08:00:00+08:00',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 0,
    };
    useChatStore.setState({
      currentConversation: staleConversation,
      conversations: [staleConversation],
      messages: [
        {
          id: 'msg-stale-send',
          conversation_id: staleConversation.id,
          role: 'assistant',
          content: '旧消息',
          message_type: 'text',
          metadata: null,
          created_at: '2026-04-29T07:40:00+08:00',
        },
      ],
    });
    const send = vi
      .spyOn(api, 'sendMessage')
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Conversation not found' }), { status: 404 }))
      .mockResolvedValueOnce(
        createMockSSEResponse(
          [
            { type: 'token', content: '新的对话已连接' },
            { type: 'done', message_id: 'msg-fresh-done', message_type: 'text' },
          ],
          1,
        ),
      );
    vi.spyOn(api, 'createConversation').mockResolvedValueOnce(freshConversation);

    await useChatStore.getState().sendMessage('你好');
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(false));

    expect(send).toHaveBeenNthCalledWith(1, staleConversation.id, '你好', undefined);
    expect(send).toHaveBeenNthCalledWith(2, freshConversation.id, '你好', undefined);
    expect(useChatStore.getState().currentConversation?.id).toBe(freshConversation.id);
    expect(useChatStore.getState().messages.map((message) => message.conversation_id)).toEqual([
      freshConversation.id,
      freshConversation.id,
    ]);
    expect(useChatStore.getState().messages.at(-1)?.content).toBe('新的对话已连接');
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
