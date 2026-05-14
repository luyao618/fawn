'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageList } from '@/components/chat/MessageList';
import { useChatStore } from '@/lib/chat-store';

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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(82);
  const composerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function updateKeyboardInset() {
      const viewport = window.visualViewport;
      const nextInset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      setKeyboardInset(nextInset > 80 ? Math.ceil(nextInset) : 0);
      if (process.env.NODE_ENV !== 'test' && typeof window.scrollTo === 'function') {
        window.requestAnimationFrame(() => {
          try {
            window.scrollTo({ top: 0, left: 0 });
          } catch {
            // jsdom exposes scrollTo but does not implement it.
          }
        });
      }
    }

    updateKeyboardInset();
    window.addEventListener('resize', updateKeyboardInset);
    window.visualViewport?.addEventListener('resize', updateKeyboardInset);
    window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
    return () => {
      window.removeEventListener('resize', updateKeyboardInset);
      window.visualViewport?.removeEventListener('resize', updateKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardInset);
    };
  }, []);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;

    function updateComposerHeight(target: HTMLElement) {
      setComposerHeight(Math.ceil(target.getBoundingClientRect().height));
    }

    updateComposerHeight(element);
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => updateComposerHeight(element);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const observer = new ResizeObserver(() => updateComposerHeight(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const chatStyle = {
    '--chat-composer-bottom': keyboardInset > 0 ? `${keyboardInset}px` : 'calc(100px + var(--safe-area-bottom))',
    '--chat-composer-height': `${composerHeight}px`,
  } as CSSProperties;

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
    <div
      className="fixed inset-x-0 top-0 z-30 mx-auto flex h-screen max-w-mobile flex-col overflow-hidden bg-transparent overscroll-none"
      style={chatStyle}
    >
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
      <div ref={composerRef} className="fixed inset-x-0 z-50 mx-auto max-w-mobile" style={{ bottom: 'var(--chat-composer-bottom)' }}>
        <ChatInput
          disabled={isStreaming}
          attachedImage={attachedImage}
          onAttach={handleAttach}
          onRemoveImage={() => setAttachedImage(null)}
          onSend={handleSend}
          historyHref="/history"
        />
      </div>
    </div>
  );
}
