'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search } from 'lucide-react';
import { useChatStore } from '@/lib/chat-store';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function HistoryPage() {
  const { conversations, loadConversations, searchConversations, searchResults } = useChatStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await searchConversations(query);
  }

  const groups = useMemo(() => {
    return conversations.reduce<Record<string, typeof conversations>>((acc, conversation) => {
      const key = formatDate(conversation.started_at, 'yyyy年M月d日');
      acc[key] = [...(acc[key] ?? []), conversation];
      return acc;
    }, {});
  }, [conversations]);

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center">
        <Link
          href="/chat"
          className="inline-flex min-h-10 items-center gap-1 rounded-full bg-white/85 px-3 text-sm font-semibold text-fawn-amber shadow-card ring-1 ring-white/70"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.9} aria-hidden />
          返回管家
        </Link>
      </div>

      <form onSubmit={onSearch} className="mb-4 flex items-center gap-2 rounded-input bg-white px-3 shadow-card">
        <Search className="h-5 w-5 text-mid-gray" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索历史对话"
          className="min-h-11 flex-1 bg-transparent text-base outline-none placeholder:text-mid-gray"
        />
      </form>

      {searchResults.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2 text-base font-semibold text-soft-charcoal">搜索结果</h2>
          <div className="space-y-2">
            {searchResults.map((message) => (
              <Link
                key={message.id}
                href={`/chat?id=${message.conversation_id}`}
                className="block rounded-card border border-oat-border bg-white p-3 shadow-card"
              >
                <p className="text-sm text-dark-gray">{formatDateTime(message.created_at)}</p>
                <p className="mt-1 line-clamp-2 text-base text-soft-charcoal">{message.content}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-5">
        {Object.entries(groups).map(([date, items]) => (
          <section key={date}>
            <h2 className="mb-2 text-sm font-semibold text-dark-gray">{date}</h2>
            <div className="space-y-2">
              {items.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/chat?id=${conversation.id}`}
                  className="block rounded-card border border-oat-border bg-white p-4 shadow-card"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-soft-charcoal">
                      {conversation.summary ?? '未生成摘要'}
                    </p>
                    <span className="shrink-0 text-xs text-mid-gray">{conversation.message_count} 条</span>
                  </div>
                  <p className="mt-2 text-sm text-dark-gray">{formatDateTime(conversation.started_at)}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
