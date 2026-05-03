import { DataCard } from './DataCard';
import { MarkdownMessage } from './MarkdownMessage';
import { SafetyAlert } from './SafetyAlert';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import type { Message } from '@/lib/types';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function metadataCard(metadata: Record<string, unknown> | null) {
  const type = metadata?.type;
  const data = metadata?.data;
  if (
    (type === 'growth' || type === 'feeding' || type === 'sleep' || type === 'health') &&
    data &&
    typeof data === 'object'
  ) {
    return { type, data: data as Record<string, unknown> };
  }
  return null;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const currentUser = useAuthStore((state) => state.user);
  const isMine = isUser && (!message.sender_user_id || message.sender_user_id === currentUser?.id);
  const sender = message.sender;
  const senderLabel = sender ? `${sender.display_name} · ${sender.role}` : '家庭成员';
  const card = metadataCard(message.metadata);
  const imageUrl = typeof message.metadata?.image_url === 'string' ? message.metadata.image_url : null;

  if (!isUser) {
    return (
      <div className="flex justify-start">
        <div className="animate-[bubble-in_200ms_ease-out] max-w-[92%] break-words px-1 py-1 text-base leading-7 text-soft-charcoal max-[374px]:max-w-[96%]">
          {message.message_type === 'safety_alert' ? (
            <SafetyAlert content={message.content} />
          ) : message.message_type === 'image' && imageUrl ? (
            <img src={imageUrl} alt={message.content} className="max-h-64 rounded-xl object-cover" />
          ) : (
            <>
              <MarkdownMessage content={message.content} />
              {isStreaming ? <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-mid-gray align-middle" /> : null}
            </>
          )}
          {message.message_type === 'data_card' && card ? <DataCard type={card.type as 'growth' | 'feeding' | 'sleep' | 'health'} data={card.data} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-start gap-3', isMine ? 'justify-end' : 'justify-start')}>
      {!isMine ? (
        <Avatar
          label={senderLabel}
          role={sender?.access_type ?? 'family'}
          src={sender?.avatar_url}
        />
      ) : null}
      <div
        className={cn(
          'animate-[bubble-in_200ms_ease-out] break-words px-4 py-3 text-base leading-normal shadow-card',
          'max-w-[72%] max-[374px]:max-w-[78%]',
          isMine
            ? 'rounded-[22px] rounded-br-md bg-fawn-amber text-white'
            : 'rounded-[22px] rounded-bl-md bg-white text-soft-charcoal ring-1 ring-white/70',
        )}
      >
        {isUser && !isMine ? <p className="mb-1 text-xs text-dark-gray">{senderLabel}</p> : null}
        {message.message_type === 'image' && imageUrl ? (
          <img src={imageUrl} alt={message.content} className="max-h-64 rounded-xl object-cover" />
        ) : (
          <>
            {isUser ? <span className="whitespace-pre-wrap">{message.content}</span> : <MarkdownMessage content={message.content} />}
            {isStreaming ? <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-mid-gray align-middle" /> : null}
          </>
        )}
        {message.message_type === 'data_card' && card ? <DataCard type={card.type as 'growth' | 'feeding' | 'sleep' | 'health'} data={card.data} /> : null}
      </div>
      {isMine ? <Avatar label="我" role={currentUser?.access_type ?? 'parent'} src={currentUser?.avatar_url} /> : null}
    </div>
  );
}
