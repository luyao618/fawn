'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { TabBar } from '@/components/layout/TabBar';
import { TopBar } from '@/components/layout/TopBar';

const titleByPath: Array<[string, string]> = [
  ['/history', '历史对话'],
  ['/dashboard', '成长'],
  ['/record', '记录'],
  ['/album', '相册'],
  ['/profile', '家庭'],
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isChat = pathname.startsWith('/chat');
  const isDashboard = pathname.startsWith('/dashboard');
  const showTopBar = !isChat && !isDashboard;
  const title = useMemo(() => {
    return titleByPath.find(([path]) => pathname.startsWith(path))?.[1] ?? 'Fawn';
  }, [pathname]);

  return (
    <AuthGuard>
      <div className="mobile-shell relative">
        {showTopBar ? (
          <TopBar title={title} onBack={pathname.startsWith('/history') ? () => router.push('/chat') : undefined} />
        ) : null}
        <main className={isChat ? '' : 'pb-[calc(124px+var(--safe-area-bottom))]'}>{children}</main>
        <TabBar currentPath={pathname} />
      </div>
    </AuthGuard>
  );
}
