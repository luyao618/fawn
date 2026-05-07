'use client';

import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { TabBar } from '@/components/layout/TabBar';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname.startsWith('/chat');

  return (
    <AuthGuard>
      <div className="mobile-shell relative">
        <main className={isChat ? '' : 'pb-[calc(124px+var(--safe-area-bottom))]'}>{children}</main>
        <TabBar currentPath={pathname} />
      </div>
    </AuthGuard>
  );
}
