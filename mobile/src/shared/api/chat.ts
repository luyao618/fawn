import { api } from './client';
import { queryKeys } from './queryKeys';
import type {
  ChatDayTargetResponse,
  ChatImageUploadResponse,
  ChatMonthActivityResponse,
  ConversationDetail,
  ConversationSummary,
  PaginatedChatMessageSearchResults,
  PaginatedConversations,
  SendChatMessageResult,
} from './types';

async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data } = await api.get<PaginatedConversations>('/chat/conversations', {
    params: { page: 1, page_size: 50 },
  });
  return data.items;
}

export async function fetchConversationsPage(
  page: number,
  pageSize: number,
): Promise<PaginatedConversations> {
  const { data } = await api.get<PaginatedConversations>('/chat/conversations', {
    params: { page, page_size: pageSize },
  });
  return data;
}

export async function fetchConversation(
  id: string,
  beforeOrOptions?:
    | string
    | {
        before?: string;
        limit?: number;
        targetMessageId?: string;
        aroundLimit?: number;
      },
  limit = 50,
): Promise<ConversationDetail> {
  const options =
    typeof beforeOrOptions === 'object'
      ? beforeOrOptions
      : { before: beforeOrOptions, limit };
  const params: Record<string, string | number> = {
    limit: options.limit ?? limit,
  };
  if (options.before) params.before = options.before;
  if (options.targetMessageId) {
    params.target_message_id = options.targetMessageId;
    params.around_limit = options.aroundLimit ?? 25;
  }
  const { data } = await api.get<ConversationDetail>(`/chat/conversations/${id}`, {
    params,
  });
  return data;
}

export async function searchMessages(
  query: string,
  page: number,
  pageSize: number,
): Promise<PaginatedChatMessageSearchResults> {
  const { data } = await api.get<PaginatedChatMessageSearchResults>(
    '/chat/messages/search',
    {
      params: { q: query, page, page_size: pageSize },
    },
  );
  return data;
}

export async function fetchChatMonthActivity(
  year: number,
  month: number,
): Promise<ChatMonthActivityResponse> {
  const { data } = await api.get<ChatMonthActivityResponse>(
    '/chat/history/activity',
    {
      params: { year, month },
    },
  );
  return data;
}

export async function fetchChatDayTarget(
  date: string,
): Promise<ChatDayTargetResponse> {
  const { data } = await api.get<ChatDayTargetResponse>(
    '/chat/history/day-target',
    {
      params: { date },
    },
  );
  return data;
}

export async function createConversation(): Promise<ConversationSummary> {
  const { data } = await api.post<ConversationSummary>('/chat/conversations');
  return data;
}

export async function uploadChatImage(
  conversationId: string,
  uri: string,
  mimeType: string,
  filename: string,
): Promise<ChatImageUploadResponse> {
  const form = new FormData();
  // React Native FormData accepts { uri, type, name } objects; cast to any to
  // satisfy the DOM-typed FormData signature.
  form.append('file', { uri, type: mimeType, name: filename } as unknown as Blob);
  const { data } = await api.post<ChatImageUploadResponse>(
    `/chat/conversations/${conversationId}/images`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

/**
 * Upload a recorded voice file and receive the transcribed Chinese text.
 * The caller is expected to write the result into the chat draft input
 * (NOT auto-send) so the user can proof-read before pressing send.
 *
 * Backend resolves errors as 4xx/5xx with `{detail}` Chinese strings; the
 * axios interceptor surfaces those as thrown errors with the message preserved
 * on `error.response.data.detail`.
 */
export async function transcribeVoice(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<{ text: string }> {
  const form = new FormData();
  form.append('file', file as unknown as Blob);
  const { data } = await api.post<{ text: string }>(
    '/chat/voice/transcribe',
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export function messageTtsUrl(baseUrl: string, messageId: string): string {
  return `${baseUrl}/chat/messages/${messageId}/tts`;
}

export function messageTtsSource(
  baseUrl: string,
  messageId: string,
  token: string | null,
): { uri: string; headers?: Record<string, string> } {
  return {
    uri: messageTtsUrl(baseUrl, messageId),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  };
}

/**
 * Send a chat message. The backend streams an SSE response of tokens followed
 * by a final `done` event with the assistant message id. We parse SSE frames
 * incrementally via XMLHttpRequest's `onprogress` event (RN's default fetch
 * buffers the whole body before resolving, which makes streaming impossible
 * out of the box). Callers receive `onToken` for each token chunk and `onDone`
 * once the assistant message is committed; after `onDone` they should
 * invalidate the conversation query to swap the streamed text for the
 * authoritative row.
 */
export interface SendChatMessageCallbacks {
  onToken?: (content: string) => void;
  onDone?: (messageId: string, messageType: string) => void;
  onError?: (message: string) => void;
  onSessionExpired?: (expiredConversationId: string) => void;
}

export async function sendChatMessage(
  conversationId: string,
  content: string,
  imageUrl: string | null,
  baseUrl: string,
  token: string | null,
  callbacks: SendChatMessageCallbacks = {},
): Promise<SendChatMessageResult> {
  const url = `${baseUrl}/chat/conversations/${conversationId}/messages`;
  const body = JSON.stringify({ content, image_url: imageUrl });
  const { onToken, onDone, onError, onSessionExpired } = callbacks;

  return new Promise<SendChatMessageResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let processed = 0;
    let buffer = '';
    let result: SendChatMessageResult = { type: 'sent' };
    let streamError: Error | null = null;

    const parseChunk = (raw: string) => {
      buffer += raw.replace(/\r\n/g, '\n');
      // SSE events are separated by a blank line ("\n\n"). Process every
      // complete event and leave the trailing partial event in `buffer`.
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        // Each event may have multiple lines; we only care about `data:` lines.
        for (const line of event.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload) as {
              type?: string;
              content?: string;
              message_id?: string;
              message_type?: string;
              message?: string;
              expired_conversation_id?: string;
            };
            if (parsed.type === 'token' && typeof parsed.content === 'string') {
              onToken?.(parsed.content);
            } else if (parsed.type === 'done') {
              onDone?.(parsed.message_id ?? '', parsed.message_type ?? 'text');
            } else if (parsed.type === 'error') {
              const message = parsed.message ?? '发送失败';
              onError?.(message);
              streamError = new Error(message);
            } else if (parsed.type === 'session_expired') {
              const expiredConversationId =
                parsed.expired_conversation_id ?? conversationId;
              result = {
                type: 'session_expired',
                expiredConversationId,
              };
              onSessionExpired?.(expiredConversationId);
            }
          } catch {
            // Ignore malformed frames — the server occasionally sends keep-alives.
          }
        }
      }
    };

    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onprogress = () => {
      const text = xhr.responseText;
      if (text.length > processed) {
        const chunk = text.slice(processed);
        processed = text.length;
        parseChunk(chunk);
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`send message failed: ${xhr.status}`));
        return;
      }
      // Flush any remaining bytes that arrived after the last `onprogress`.
      const text = xhr.responseText;
      if (text.length > processed) {
        const chunk = text.slice(processed);
        processed = text.length;
        parseChunk(chunk);
      }
      if (streamError) {
        reject(streamError);
        return;
      }
      resolve(result);
    };
    xhr.onerror = () => reject(new Error('send message network error'));
    xhr.ontimeout = () => reject(new Error('send message timed out'));

    xhr.send(body);
  });
}

export const chatQueries = {
  conversations: () => ({
    queryKey: queryKeys.chat.conversations(),
    queryFn: fetchConversations,
  }),
  messages: (id: string) => ({
    queryKey: queryKeys.chat.messages(id),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      fetchConversation(id, pageParam, 50),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: ConversationDetail): string | undefined =>
      lastPage.has_more && lastPage.next_before ? lastPage.next_before : undefined,
  }),
  history: (pageSize: number) => ({
    queryKey: queryKeys.chat.history(pageSize),
    queryFn: ({ pageParam = 1 }: { pageParam?: number }) =>
      fetchConversationsPage(pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedConversations) => {
      const loaded = lastPage.page * lastPage.page_size;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
  }),
  search: (query: string, pageSize: number) => ({
    queryKey: queryKeys.chat.search(query, pageSize),
    queryFn: ({ pageParam = 1 }: { pageParam?: number }) =>
      searchMessages(query.trim(), pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedChatMessageSearchResults) => {
      const loaded = lastPage.page * lastPage.page_size;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: query.trim().length > 0,
  }),
  monthActivity: (year: number, month: number) => ({
    queryKey: queryKeys.chat.monthActivity(year, month),
    queryFn: () => fetchChatMonthActivity(year, month),
  }),
  dayTarget: (date: string) => ({
    queryKey: queryKeys.chat.dayTarget(date),
    queryFn: () => fetchChatDayTarget(date),
  }),
  targetWindow: (
    id: string,
    targetMessageId: string,
    aroundLimit = 25,
  ) => ({
    queryKey: queryKeys.chat.targetWindow(id, targetMessageId, aroundLimit),
    queryFn: () =>
      fetchConversation(id, {
        targetMessageId,
        aroundLimit,
        limit: aroundLimit * 2 + 1,
      }),
  }),
};

export function chatImageUrl(baseUrl: string, conversationId: string, filename: string): string {
  return `${baseUrl}/chat/conversations/${conversationId}/images/${filename}`;
}

/** Resolve an image_url string from a chat message into an absolute URL. */
export function resolveChatImageUrl(baseUrl: string, imageUrl: string): string {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  // Backend returns paths like `/api/chat/conversations/{id}/images/{file}`.
  // Strip the leading /api so we can join with our base URL (which already
  // points at the FastAPI root in dev).
  const trimmed = imageUrl.replace(/^\/api/, '');
  return `${baseUrl}${trimmed}`;
}
