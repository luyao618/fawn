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
    hasMore: false,
    nextBefore: null,
    isLoadingMore: false,
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

  it('loadConversation seeds pagination state from the first page response', async () => {
    const conversation = {
      id: 'conv-page-1',
      started_at: '2026-05-01T10:00:00Z',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 75,
    };
    vi.spyOn(api, 'getConversation').mockResolvedValueOnce({
      conversation,
      messages: [
        { id: 'm-25', conversation_id: 'conv-page-1', role: 'user', content: '25', message_type: 'text', metadata: null, created_at: '2026-05-01T12:00:00Z' },
        { id: 'm-26', conversation_id: 'conv-page-1', role: 'assistant', content: '26', message_type: 'text', metadata: null, created_at: '2026-05-01T12:01:00Z' },
      ],
      has_more: true,
      next_before: 'm-25',
    });
    await useChatStore.getState().loadConversation('conv-page-1');
    const state = useChatStore.getState();
    expect(state.messages.map((m) => m.id)).toEqual(['m-25', 'm-26']);
    expect(state.hasMore).toBe(true);
    expect(state.nextBefore).toBe('m-25');
    expect(state.isLoadingMore).toBe(false);
  });

  it('loadOlder prepends an older page and dedupes against current messages', async () => {
    const conversation = {
      id: 'conv-older',
      started_at: '2026-05-01T10:00:00Z',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 100,
    };
    useChatStore.setState({
      currentConversation: conversation,
      messages: [
        { id: 'm-50', conversation_id: 'conv-older', role: 'user', content: '50', message_type: 'text', metadata: null, created_at: '2026-05-01T13:00:00Z' },
        { id: 'm-51', conversation_id: 'conv-older', role: 'assistant', content: '51', message_type: 'text', metadata: null, created_at: '2026-05-01T13:01:00Z' },
      ],
      hasMore: true,
      nextBefore: 'm-50',
      isLoadingMore: false,
    });
    vi.spyOn(api, 'getConversation').mockResolvedValueOnce({
      conversation,
      messages: [
        { id: 'm-48', conversation_id: 'conv-older', role: 'user', content: '48', message_type: 'text', metadata: null, created_at: '2026-05-01T12:58:00Z' },
        { id: 'm-49', conversation_id: 'conv-older', role: 'assistant', content: '49', message_type: 'text', metadata: null, created_at: '2026-05-01T12:59:00Z' },
        // Boundary overlap with current page — dedup must drop the second copy.
        { id: 'm-50', conversation_id: 'conv-older', role: 'user', content: '50-dup', message_type: 'text', metadata: null, created_at: '2026-05-01T13:00:00Z' },
      ],
      has_more: false,
      next_before: null,
    });
    await useChatStore.getState().loadOlder();
    const state = useChatStore.getState();
    expect(state.messages.map((m) => m.id)).toEqual(['m-48', 'm-49', 'm-50', 'm-51']);
    expect(state.hasMore).toBe(false);
    expect(state.nextBefore).toBeNull();
    expect(state.isLoadingMore).toBe(false);
  });

  it('loadOlder is a no-op when isLoadingMore or hasMore is false', async () => {
    const conversation = {
      id: 'conv-guard',
      started_at: '2026-05-01T10:00:00Z',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 1,
    };
    const spy = vi.spyOn(api, 'getConversation');
    // No-op: hasMore false
    useChatStore.setState({
      currentConversation: conversation,
      messages: [],
      hasMore: false,
      nextBefore: null,
      isLoadingMore: false,
    });
    await useChatStore.getState().loadOlder();
    expect(spy).not.toHaveBeenCalled();
    // No-op: isLoadingMore true
    useChatStore.setState({
      currentConversation: conversation,
      messages: [],
      hasMore: true,
      nextBefore: 'cursor',
      isLoadingMore: true,
    });
    await useChatStore.getState().loadOlder();
    expect(spy).not.toHaveBeenCalled();
  });

  it('refreshFirstPage prepends the freshly fetched page 0 with dedup', async () => {
    const conversation = {
      id: 'conv-refresh',
      started_at: '2026-05-01T10:00:00Z',
      ended_at: null,
      is_active: true,
      summary: null,
      message_count: 60,
    };
    useChatStore.setState({
      currentConversation: conversation,
      messages: [
        // simulate a streaming-synthesized row keyed by canonical id
        { id: 'm-100', conversation_id: 'conv-refresh', role: 'assistant', content: 'local synth', message_type: 'text', metadata: null, created_at: '2026-05-01T14:00:00Z' },
      ],
      hasMore: true,
      nextBefore: 'm-50',
      isLoadingMore: false,
    });
    vi.spyOn(api, 'getConversation').mockResolvedValueOnce({
      conversation,
      messages: [
        { id: 'm-100', conversation_id: 'conv-refresh', role: 'assistant', content: 'canonical', message_type: 'text', metadata: null, created_at: '2026-05-01T14:00:00Z' },
        { id: 'm-101', conversation_id: 'conv-refresh', role: 'assistant', content: 'next', message_type: 'text', metadata: null, created_at: '2026-05-01T14:01:00Z' },
      ],
      has_more: true,
      next_before: 'm-100',
    });
    await useChatStore.getState().refreshFirstPage();
    const state = useChatStore.getState();
    // dedup keeps the canonical first-occurrence row, drops the local synth.
    expect(state.messages.map((m) => m.id)).toEqual(['m-100', 'm-101']);
    expect(state.messages[0].content).toBe('canonical');
    // hasMore / nextBefore are NOT changed by refreshFirstPage.
    expect(state.hasMore).toBe(true);
    expect(state.nextBefore).toBe('m-50');
  });
});
