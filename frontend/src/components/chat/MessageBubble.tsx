import { DataCard } from './DataCard';
import { MarkdownMessage } from './MarkdownMessage';
import { SafetyAlert } from './SafetyAlert';
import { useAuthStore } from '@/lib/auth-store';
import { cn, roleLabel } from '@/lib/utils';
import type { Message, User } from '@/lib/types';

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

function senderIdentity(sender: User | null | undefined, fallback: User | null) {
  const identity = sender ?? fallback;
  return {
    name: identity?.display_name ?? '家庭成员',
    role: roleLabel(identity?.role),
  };
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const currentUser = useAuthStore((state) => state.user);
  const fallbackSender = !message.sender_user_id || message.sender_user_id === currentUser?.id ? currentUser : null;
  const sender = senderIdentity(message.sender, fallbackSender);
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
    <div className="flex flex-col items-end" data-testid="user-message-row">
      <div className="mb-1 flex max-w-[78%] flex-wrap items-center justify-end gap-1.5 px-1 leading-none max-[374px]:max-w-[84%]">
        <span className="max-w-32 truncate text-xs font-semibold text-soft-charcoal">{sender.name}</span>
        <span className="rounded-full bg-soft-charcoal/10 px-2 py-1 text-[11px] font-semibold text-dark-gray">{sender.role}</span>
      </div>
      <div
        className={cn(
          'animate-[bubble-in_200ms_ease-out] max-w-[78%] break-words rounded-[22px] rounded-tr-md bg-fawn-amber px-4 py-3 text-base leading-normal text-white shadow-card',
          'max-[374px]:max-w-[84%]',
        )}
      >
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
    </div>
  );
}
