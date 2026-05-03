import { Baby, Bot, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserAccessType } from '@/lib/types';

const ringByRole: Record<UserAccessType | 'agent' | 'baby', string> = {
  parent: 'bg-nursery-butter text-brand-strong ring-white',
  family: 'bg-white text-role-grandma ring-nursery-powder',
  friend: 'bg-white text-dark-gray ring-oat-border',
  agent: 'bg-nursery-mint text-brand-strong ring-white',
  baby: 'bg-nursery-powder text-info-blue ring-white',
};

interface AvatarProps {
  src?: string | null;
  label: string;
  role?: UserAccessType | 'agent' | 'baby';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-16 w-16',
};

export function Avatar({ src, label, role = 'family', size = 'sm', className }: AvatarProps) {
  const icon =
    role === 'agent' ? <Bot className="h-5 w-5" /> : role === 'baby' ? <Baby className="h-5 w-5" /> : <UserRound className="h-5 w-5" />;

  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full shadow-card ring-2',
        ringByRole[role],
        sizeClass[size],
        className,
      )}
      aria-label={label}
      title={label}
    >
      {src ? <img src={src} alt={label} className="h-full w-full object-cover" /> : icon}
    </div>
  );
}
