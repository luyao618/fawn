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
        'sticky top-0 z-30 px-4 pt-3',
        className,
      )}
    >
      <div className="flex min-h-[68px] items-center justify-between gap-3 rounded-b-[28px] border border-white/70 bg-[rgba(255,251,235,0.88)] px-3 py-3 shadow-topbar backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/80 text-soft-charcoal shadow-card"
              aria-label="返回"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={1.8} />
            </button>
          ) : null}
          <h1 className="truncate text-[22px] font-semibold leading-snug text-soft-charcoal">{title}</h1>
        </div>
        <div className="flex min-h-11 shrink-0 items-center justify-end">{rightAction}</div>
      </div>
    </header>
  );
}
