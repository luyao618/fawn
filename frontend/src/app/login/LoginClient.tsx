'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/lib/auth-store';

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const [username, setUsername] = useState('mama');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');
  const next = searchParams.get('next') || '/chat';

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (isAuthenticated) router.replace('/chat');
  }, [isAuthenticated, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await login(username, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查用户名和密码');
    }
  }

  return (
    <main className="mobile-shell grid place-items-center px-5 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-card border border-oat-border bg-white p-5 shadow-card"
      >
        <div className="mb-8">
          <p className="text-sm text-dark-gray">欢迎回来</p>
          <h1 className="mt-1 text-2xl font-semibold text-soft-charcoal">Fawn</h1>
        </div>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm text-dark-gray">用户名</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="min-h-11 w-full rounded-input border border-oat-border bg-warm-gray px-4 text-base outline-none focus:border-fawn-amber"
            autoComplete="username"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-2 block text-sm text-dark-gray">密码</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            className="min-h-11 w-full rounded-input border border-oat-border bg-warm-gray px-4 text-base outline-none focus:border-fawn-amber"
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-safety-red-light px-3 py-2 text-sm text-safety-red">
            <AlertCircle className="h-4 w-4" aria-hidden />
            {error}
          </div>
        ) : null}

        <Button type="submit" className="w-full" loading={isLoading}>
          登录
        </Button>
      </form>
    </main>
  );
}
