'use client';

import { create } from 'zustand';
import { api } from './api';
import { useAuthStore } from './auth-store';
import { consumeSSE } from './sse';
import type { Conversation, Message, MessageSearchResult, MessageType, SSEEvent } from './types';

interface DataCardDraft {
  type: string;
  data: Record<string, unknown>;
}

interface ChatState {
  currentConversation: Conversation | null;
  messages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  pendingToolCalls: string[];
  conversations: Conversation[];
  searchResults: MessageSearchResult[];
  error: string | null;
  dataCardDraft: DataCardDraft | null;
  reset: () => void;
  createConversation: () => Promise<Conversation>;
  loadConversation: (id: string) => Promise<void>;
  loadConversations: (page?: number) => Promise<void>;
  sendMessage: (content: string, imageUrl?: string) => Promise<void>;
  uploadChatImage: (conversationId: string, file: File) => Promise<string>;
  handleSSEEvent: (event: SSEEvent) => void;
  searchConversations: (query: string) => Promise<MessageSearchResult[]>;
}

function id(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dataCardFromResult(result: Record<string, unknown>): DataCardDraft | null {
  const type = typeof result.type === 'string' ? result.type : null;
  if (!type) return null;
  return { type, data: result };
}

function makeAssistantMessage(
  conversationId: string,
  messageId: string,
  content: string,
  messageType: MessageType,
  dataCardDraft: DataCardDraft | null,
): Message {
  const metadata = dataCardDraft ? { type: dataCardDraft.type, data: dataCardDraft.data } : null;
  return {
    id: messageId,
    conversation_id: conversationId,
    role: 'assistant',
    content: content || '已完成。',
    message_type: dataCardDraft ? 'data_card' : messageType,
    metadata,
    created_at: new Date().toISOString(),
  };
}

type ChatDataState = Pick<
  ChatState,
  | 'currentConversation'
  | 'messages'
  | 'isStreaming'
  | 'streamingContent'
  | 'pendingToolCalls'
  | 'conversations'
  | 'searchResults'
  | 'error'
  | 'dataCardDraft'
>;

type ActiveChatDataState = Pick<
  ChatDataState,
  | 'currentConversation'
  | 'messages'
  | 'isStreaming'
  | 'streamingContent'
  | 'pendingToolCalls'
  | 'error'
  | 'dataCardDraft'
>;

function emptyActiveChatDataState(error: string | null = null): ActiveChatDataState {
  return {
    currentConversation: null,
    messages: [],
    isStreaming: false,
    streamingContent: '',
    pendingToolCalls: [],
    error,
    dataCardDraft: null,
  };
}

function emptyChatDataState(): ChatDataState {
  return {
    ...emptyActiveChatDataState(),
    conversations: [],
    searchResults: [],
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  ...emptyChatDataState(),

  reset() {
    set(emptyChatDataState());
  },

  async createConversation() {
    const conversation = await api.createConversation();
    set((state) => ({
      currentConversation: conversation,
      conversations: [conversation, ...state.conversations.filter((item) => item.id !== conversation.id)],
      messages: [],
      error: null,
    }));
    return conversation;
  },

  async loadConversation(conversationId) {
    const response = await api.getConversation(conversationId);
    set({
      currentConversation: response.conversation,
      messages: response.messages,
      isStreaming: false,
      streamingContent: '',
      pendingToolCalls: [],
      dataCardDraft: null,
      error: null,
    });
  },

  async loadConversations(page = 1) {
    const response = await api.getConversations(page);
    set((state) => {
      const currentConversationId = state.currentConversation?.id;
      const currentStillVisible =
        !currentConversationId ||
        response.items.some((conversation) => conversation.id === currentConversationId);
      return {
        conversations: response.items,
        ...(page === 1 && !currentStillVisible ? emptyActiveChatDataState() : {}),
      };
    });
  },

  async sendMessage(content, imageUrl) {
    const send = async (allowMissingConversationRecovery: boolean): Promise<void> => {
      const trimmed = content.trim();
      if (!trimmed && !imageUrl) return;

      let conversation = get().currentConversation;
      if (!conversation) conversation = await get().createConversation();
      const currentUser = useAuthStore.getState().user;

      const localMessageId = id('user');
      const userMessage: Message = {
        id: localMessageId,
        conversation_id: conversation.id,
        sender_user_id: currentUser?.id ?? null,
        sender: currentUser ?? null,
        role: 'user',
        content: trimmed || '发送了一张照片',
        message_type: imageUrl ? 'image' : 'text',
        metadata: imageUrl ? { image_url: imageUrl } : null,
        created_at: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, userMessage],
        isStreaming: true,
        streamingContent: '',
        pendingToolCalls: [],
        dataCardDraft: null,
        error: null,
      }));

      let sessionExpired = false;
      try {
        const response = await api.sendMessage(conversation.id, trimmed, imageUrl);
        if (response.status === 401) {
          useAuthStore.getState().logout();
          set({ isStreaming: false, pendingToolCalls: [], error: '登录已过期，请重新登录' });
          return;
        }
        if (response.status === 404 && allowMissingConversationRecovery) {
          set({ ...emptyActiveChatDataState(), conversations: [] });
          await get().createConversation();
          await send(false);
          return;
        }

        await consumeSSE(response, {
          onToken: (token) => get().handleSSEEvent({ type: 'token', content: token }),
          onToolCall: (name, args) => get().handleSSEEvent({ type: 'tool_call', name, args }),
          onToolResult: (name, result) => get().handleSSEEvent({ type: 'tool_result', name, result }),
          onDone: (messageId, messageType) =>
            get().handleSSEEvent({ type: 'done', message_id: messageId, message_type: messageType }),
          onError: (message) => get().handleSSEEvent({ type: 'error', message }),
          onSessionExpired: () => {
            sessionExpired = true;
          },
        });

        if (sessionExpired) {
          set((state) => ({
            messages: state.messages.filter((message) => message.id !== localMessageId),
            isStreaming: false,
            streamingContent: '',
            pendingToolCalls: [],
            dataCardDraft: null,
          }));
          await get().createConversation();
          await send(false);
        }
      } catch (error) {
        set({
          isStreaming: false,
          streamingContent: '',
          pendingToolCalls: [],
          dataCardDraft: null,
          error: error instanceof Error ? error.message : '网络错误，请稍后重试',
        });
      }
    };

    await send(true);
  },

  async uploadChatImage(conversationId, file) {
    const response = await api.uploadChatImage(conversationId, file);
    return response.image_url;
  },

  handleSSEEvent(event) {
    switch (event.type) {
      case 'token':
        set((state) => ({ streamingContent: `${state.streamingContent}${event.content}` }));
        break;
      case 'tool_call':
        set((state) => ({ pendingToolCalls: [...state.pendingToolCalls, event.name] }));
        break;
      case 'tool_result':
        set((state) => ({
          pendingToolCalls: state.pendingToolCalls.filter((name) => name !== event.name),
          dataCardDraft: dataCardFromResult(event.result) ?? state.dataCardDraft,
        }));
        break;
      case 'done': {
        const conversation = get().currentConversation;
        if (!conversation) return;
        const message = makeAssistantMessage(
          conversation.id,
          event.message_id,
          get().streamingContent,
          event.message_type,
          get().dataCardDraft,
        );
        set((state) => ({
          messages: [...state.messages, message],
          isStreaming: false,
          streamingContent: '',
          pendingToolCalls: [],
          dataCardDraft: null,
        }));
        break;
      }
      case 'error':
        set({
          isStreaming: false,
          streamingContent: '',
          pendingToolCalls: [],
          dataCardDraft: null,
          error: event.message,
        });
        break;
      case 'session_expired':
        set({ error: `对话 ${event.expired_conversation_id} 已超时，正在创建新对话` });
        break;
    }
  },

  async searchConversations(query) {
    if (!query.trim()) {
      set({ searchResults: [] });
      return [];
    }
    const response = await api.searchMessages(query.trim());
    set({ searchResults: response.items });
    return response.items;
  },
}));

let activeFamilyId = useAuthStore.getState().user?.family_id ?? null;
useAuthStore.subscribe((state) => {
  const familyId = state.user?.family_id ?? null;
  if (familyId === activeFamilyId) return;
  activeFamilyId = familyId;
  useChatStore.getState().reset();
});
