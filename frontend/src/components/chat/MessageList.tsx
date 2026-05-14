'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TimeSeparator } from './TimeSeparator';
import { TypingIndicator } from './TypingIndicator';
import type { Message } from '@/lib/types';

interface MessageListProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  pendingToolCalls: string[];
}

function needsSeparator(previous: Message | undefined, current: Message) {
  if (!previous) return true;
  return new Date(current.created_at).getTime() - new Date(previous.created_at).getTime() > 5 * 60_000;
}

export function MessageList({ messages, streamingContent, isStreaming, pendingToolCalls }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [messages.length, streamingContent, pendingToolCalls.length]);

  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">
      <div className="space-y-4">
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
