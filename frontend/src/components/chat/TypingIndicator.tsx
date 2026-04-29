import { Avatar } from '@/components/ui/Avatar';

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <Avatar label="Fawn Agent" role="agent" />
      <div className="flex h-11 items-center gap-1 rounded-bubble rounded-tl bg-warm-gray px-4">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 rounded-full bg-mid-gray"
            style={{ animation: `typing-dot 1.1s ${delay}ms infinite ease-in-out` }}
          />
        ))}
      </div>
    </div>
  );
}
