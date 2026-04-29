'use client';

import Link from 'next/link';
import { BarChart2, Image, MessageCircle, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabBarProps {
  currentPath: string;
}

const tabs = [
  { label: '对话', href: '/chat', icon: MessageCircle },
  { label: '数据', href: '/dashboard', icon: BarChart2 },
  { label: '相册', href: '/album', icon: Image },
  { label: '我的', href: '/profile', icon: User },
];

export function TabBar({ currentPath }: TabBarProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-mobile border-t border-oat-border bg-white safe-bottom">
      <div className="grid h-[49px] grid-cols-4">
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
                'flex min-h-[49px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium leading-tight transition-colors',
                active ? 'text-fawn-amber' : 'text-mid-gray',
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
