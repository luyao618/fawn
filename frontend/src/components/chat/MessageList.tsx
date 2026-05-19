'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TimeSeparator } from './TimeSeparator';
import { TypingIndicator } from './TypingIndicator';
import type { Message } from '@/lib/types';

interface MessageListProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  pendingToolCalls: string[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

function needsSeparator(previous: Message | undefined, current: Message) {
  if (!previous) return true;
  return new Date(current.created_at).getTime() - new Date(previous.created_at).getTime() > 5 * 60_000;
}

export function MessageList({
  messages,
  streamingContent,
  isStreaming,
  pendingToolCalls,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Snapshot scroll geometry just before a `loadOlder` resolves so we can
  // preserve the user's visual anchor after the prepended page expands the
  // list height. Set when `isLoadingMore` flips true, consumed by the
  // useLayoutEffect that fires when `messages.length` next increases.
  const preLoadGeometry = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const wasLoadingMore = useRef(false);
  const prevMessagesLength = useRef(messages.length);

  const streamingMessage = useMemo<Message | null>(() => {
    if (!streamingContent) return null;
    return {
      id: 'streaming',
      conversation_id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      message_type: 'text',
      metadata: null,
      created_at: new Date().toISOString(),
    };
  }, [streamingContent]);

  // Capture scroll geometry the moment a load-more begins so the post-prepend
  // useLayoutEffect has a baseline to restore against.
  useEffect(() => {
    if (isLoadingMore && !wasLoadingMore.current) {
      const list = listRef.current;
      if (list) {
        preLoadGeometry.current = {
          scrollHeight: list.scrollHeight,
          scrollTop: list.scrollTop,
        };
      }
    }
    wasLoadingMore.current = isLoadingMore;
  }, [isLoadingMore]);

  // Restore scroll position synchronously after the DOM expands. Using
  // useLayoutEffect (not useEffect) is critical: by useEffect time the
  // browser has already painted the jumped frame.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const messagesGrew = messages.length > prevMessagesLength.current;
    if (messagesGrew && preLoadGeometry.current) {
      const { scrollHeight: prevH, scrollTop: prevT } = preLoadGeometry.current;
      const delta = list.scrollHeight - prevH;
      list.scrollTop = prevT + delta;
      preLoadGeometry.current = null;
    } else if (messagesGrew || streamingContent || pendingToolCalls.length) {
      // Brand-new tail message (send/done) or streaming tick — pin to bottom.
      if (typeof list.scrollTo === 'function') {
        list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
      } else {
        list.scrollTop = list.scrollHeight;
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, streamingContent, pendingToolCalls.length]);

  // Observe the top sentinel and trigger onLoadMore when the user scrolls it
  // into view. Re-bind whenever the loader callback or guard flags change.
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const sentinel = topSentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isLoadingMore) onLoadMore();
        }
      },
      { root, threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoadingMore]);

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
      <div className="space-y-4">
        <div ref={topSentinelRef} aria-hidden style={{ height: 1 }} />
        {isLoadingMore ? (
          <div className="py-2 text-center text-xs text-dark-gray">加载更早历史…</div>
        ) : null}
        {messages.map((message, index) => (
          <div key={message.id}>
            {needsSeparator(messages[index - 1], message) ? <TimeSeparator timestamp={message.created_at} /> : null}
            <MessageBubble message={message} />
          </div>
        ))}
        {pendingToolCalls.length > 0 ? <TypingIndicator /> : null}
        {streamingMessage ? <MessageBubble message={streamingMessage} isStreaming={isStreaming} /> : null}
      </div>
      <div
        aria-hidden
        style={{ height: 'calc(var(--chat-composer-height, 82px) + var(--chat-composer-bottom, 100px) + 16px)' }}
      />
    </div>
  );
}
