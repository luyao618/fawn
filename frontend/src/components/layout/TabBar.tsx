'use client';

import Link from 'next/link';
import { BarChart2, Bot, ClipboardList, Image, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabBarProps {
  currentPath: string;
}

const tabs = [
  { label: '管家', href: '/chat', icon: Bot },
  { label: '成长', href: '/dashboard', icon: BarChart2 },
  { label: '记录', href: '/record', icon: ClipboardList },
  { label: '相册', href: '/album', icon: Image },
  { label: '家庭', href: '/profile', icon: Users },
];

export function TabBar({ currentPath }: TabBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-mobile bg-gradient-to-t from-white via-white/95 to-transparent px-3 pt-5 pb-[calc(10px+var(--safe-area-bottom))]">
      <div className="grid h-[78px] grid-cols-5 items-center gap-1 rounded-t-[30px] border border-white/70 bg-white/90 px-2 pt-2 shadow-tabbar backdrop-blur-xl">
        {tabs.map((tab) => {
          const active =
            currentPath === tab.href ||
            (tab.href === '/chat' && currentPath.startsWith('/history')) ||
            (tab.href !== '/chat' && currentPath.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold leading-tight transition-colors',
                active ? 'bg-nursery-mint text-brand-strong shadow-card' : 'text-mid-gray',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
              <span className="truncate">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
