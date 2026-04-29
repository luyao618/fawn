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
  const bottomRef = useRef<HTMLDivElement>(null);
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
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, streamingContent, pendingToolCalls.length]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="space-y-3">
        {messages.map((message, index) => (
          <div key={message.id}>
            {needsSeparator(messages[index - 1], message) ? <TimeSeparator timestamp={message.created_at} /> : null}
            <MessageBubble message={message} />
          </div>
        ))}
        {pendingToolCalls.length > 0 ? <TypingIndicator /> : null}
        {streamingMessage ? <MessageBubble message={streamingMessage} isStreaming={isStreaming} /> : null}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
