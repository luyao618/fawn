'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    loadFromStorage().finally(() => {
      if (active) setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [loadFromStorage]);

  useEffect(() => {
    if (!hydrated || isLoading) return;
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, isAuthenticated, isLoading, pathname, router]);

  if (!hydrated || isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-warm-cream px-4 text-sm text-dark-gray">
        正在恢复登录状态...
      </div>
    );
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
