'use client';

import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopBarProps {
  title: string;
  rightAction?: React.ReactNode;
  onBack?: () => void;
  className?: string;
}

export function TopBar({ title, rightAction, onBack, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-11 items-center justify-between border-b border-oat-border bg-white/95 px-3 backdrop-blur',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="grid h-11 w-11 place-items-center rounded-full text-soft-charcoal"
            aria-label="返回"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={1.8} />
          </button>
        ) : null}
        <h1 className="truncate text-xl font-semibold leading-snug text-soft-charcoal">{title}</h1>
      </div>
      <div className="flex min-h-11 items-center justify-end">{rightAction}</div>
    </header>
  );
}
