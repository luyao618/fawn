'use client';

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { TabBar } from '@/components/layout/TabBar';
import { TopBar } from '@/components/layout/TopBar';

const titleByPath: Array<[string, string]> = [
  ['/history', '历史对话'],
  ['/dashboard', '数据看板'],
  ['/album', '相册'],
  ['/profile', '我的'],
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isChat = pathname.startsWith('/chat');
  const showTabBar = !isChat;
  const title = useMemo(() => {
    return titleByPath.find(([path]) => pathname.startsWith(path))?.[1] ?? 'Fawn';
  }, [pathname]);

  return (
    <AuthGuard>
      <div className="mobile-shell relative">
        {!isChat ? (
          <TopBar title={title} onBack={pathname.startsWith('/history') ? () => router.push('/chat') : undefined} />
        ) : null}
        <main className={showTabBar ? 'pb-[calc(65px+var(--safe-area-bottom))]' : ''}>{children}</main>
        {showTabBar ? <TabBar currentPath={pathname} /> : null}
      </div>
    </AuthGuard>
  );
}
