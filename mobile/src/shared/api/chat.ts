import { api } from './client';
import { queryKeys } from './queryKeys';
import type {
  ChatImageUploadResponse,
  ConversationDetail,
  ConversationSummary,
  PaginatedConversations,
} from './types';

async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data } = await api.get<PaginatedConversations>('/chat/conversations', {
    params: { page: 1, page_size: 50 },
  });
  return data.items;
}

async function fetchConversation(id: string): Promise<ConversationDetail> {
  const { data } = await api.get<ConversationDetail>(`/chat/conversations/${id}`);
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
 * Send a chat message. The backend streams an SSE response of tokens + a final
 * `done` event with the assistant message id. For v1 we don't render the
 * intermediate tokens — we wait for the stream to finish, then re-fetch the
 * conversation so the canonical user + assistant rows land in the cache. This
 * keeps the UI logic small and matches the AC ("发文本/图片消息成功并落聊天历史").
 */
export async function sendChatMessage(
  conversationId: string,
  content: string,
  imageUrl: string | null,
  baseUrl: string,
  token: string | null,
): Promise<void> {
  const url = `${baseUrl}/chat/conversations/${conversationId}/messages`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content, image_url: imageUrl }),
  });
  if (!res.ok) {
    throw new Error(`send message failed: ${res.status}`);
  }
  // Drain the body so the server commits before we re-fetch. We don't need to
  // parse the SSE frames for v1.
  await res.text();
}

export const chatQueries = {
  conversations: () => ({
    queryKey: queryKeys.chat.conversations(),
    queryFn: fetchConversations,
  }),
  conversation: (id: string) => ({
    queryKey: queryKeys.chat.conversation(id),
    queryFn: () => fetchConversation(id),
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
