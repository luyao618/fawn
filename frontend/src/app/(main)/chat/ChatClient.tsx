'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Clock } from 'lucide-react';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageList } from '@/components/chat/MessageList';
import { QuickActionChips } from '@/components/chat/QuickActionChips';
import { TopBar } from '@/components/layout/TopBar';
import { useAuthStore } from '@/lib/auth-store';
import { useChatStore } from '@/lib/chat-store';
import { canWriteTracker } from '@/lib/utils';

export function ChatClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const {
    currentConversation,
    messages,
    isStreaming,
    streamingContent,
    pendingToolCalls,
    error,
    loadConversation,
    loadConversations,
    createConversation,
    sendMessage,
    uploadChatImage,
  } = useChatStore();
  const user = useAuthStore((state) => state.user);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (id) {
        await loadConversation(id);
        return;
      }
      await loadConversations();
      if (!active) return;
      const activeConversation = useChatStore.getState().conversations.find((conversation) => conversation.is_active);
      if (activeConversation) await loadConversation(activeConversation.id);
    }
    load();
    return () => {
      active = false;
    };
  }, [id, loadConversation, loadConversations]);

  async function handleAttach(file: File) {
    const conversation = currentConversation ?? (await createConversation());
    const imageUrl = await uploadChatImage(conversation.id, file);
    setAttachedImage(imageUrl);
    return imageUrl;
  }

  function handleSend(content: string, imageUrl?: string) {
    setAttachedImage(null);
    void sendMessage(content, imageUrl);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-transparent pb-[calc(100px+var(--safe-area-bottom))]">
      <TopBar
        title="管家"
        rightAction={
          <Link
            href="/history"
            className="flex min-h-11 items-center gap-1 rounded-full bg-white/80 px-3 text-sm font-semibold text-fawn-amber shadow-card"
          >
            <Clock className="h-4 w-4" aria-hidden />
            历史
          </Link>
        }
      />
      {messages.length === 0 && !isStreaming ? (
        <div className="mx-4 my-3 rounded-card bg-white/90 p-4 text-sm leading-6 text-dark-gray shadow-card ring-1 ring-white/70">
          <p className="text-base font-semibold text-soft-charcoal">今天想先记录什么？</p>
          <p className="mt-1">可以直接发送体重、喂养、睡眠或健康问题，我会整理成家庭可读的记录。</p>
        </div>
      ) : null}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        pendingToolCalls={pendingToolCalls}
      />
      {error ? <div className="bg-safety-red-light px-4 py-2 text-sm text-safety-red">{error}</div> : null}
      <QuickActionChips
        canWriteTracker={canWriteTracker(user?.access_type)}
        onSelect={(action) => void sendMessage(action)}
      />
      <ChatInput
        disabled={isStreaming}
        attachedImage={attachedImage}
        onAttach={handleAttach}
        onRemoveImage={() => setAttachedImage(null)}
        onSend={handleSend}
      />
    </div>
  );
}
