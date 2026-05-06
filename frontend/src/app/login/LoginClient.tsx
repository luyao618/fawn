'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { RegistrationRequest } from '@/lib/types';

const emptyRegistration: RegistrationRequest = {
  invite_code: '',
  family_name: '',
  username: '',
  password: '',
  display_name: '',
  role: '爸爸',
};
const authInputClass =
  'min-h-11 w-full rounded-input border border-oat-border bg-warm-gray px-4 text-base outline-none focus:border-fawn-amber';

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const [username, setUsername] = useState('mama');
  const [password, setPassword] = useState('password');
  const [error, setError] = useState('');
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerDraft, setRegisterDraft] = useState<RegistrationRequest>(emptyRegistration);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [nextAfterLogin, setNextAfterLogin] = useState(searchParams.get('next') || '/chat');

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (isAuthenticated) router.replace(nextAfterLogin);
  }, [isAuthenticated, nextAfterLogin, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await login(username, password);
      router.replace(nextAfterLogin);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查用户名和密码');
    }
  }

  async function onRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');
    setIsRegistering(true);
    try {
      await api.registerFamily(registerDraft);
      setUsername(registerDraft.username.trim());
      setPassword('');
      setNextAfterLogin('/profile');
      setRegisterDraft(emptyRegistration);
      setIsRegisterOpen(false);
      setRegisterSuccess('注册成功，请使用新账号登录。');
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : '注册失败，请稍后再试');
    } finally {
      setIsRegistering(false);
    }
  }

  function updateRegisterDraft<K extends keyof RegistrationRequest>(
    key: K,
    value: RegistrationRequest[K],
  ) {
    setRegisterDraft((state) => ({ ...state, [key]: value }));
  }

  return (
    <main className="mobile-shell grid place-items-center px-5 py-10">
      <div className="w-full space-y-3">
        <form
          onSubmit={onSubmit}
          className="w-full rounded-card border border-oat-border bg-white p-5 shadow-card"
        >
          <div className="mb-8">
            <p className="text-sm text-dark-gray">欢迎回来</p>
            <h1 className="mt-1 text-2xl font-semibold text-soft-charcoal">Fawn</h1>
          </div>

          {registerSuccess ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-nursery-mint px-3 py-2 text-sm text-brand-strong">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {registerSuccess}
            </div>
          ) : null}

          <label className="mb-4 block">
            <span className="mb-2 block text-sm text-dark-gray">用户名</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={authInputClass}
              autoComplete="username"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-2 block text-sm text-dark-gray">密码</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className={authInputClass}
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

          <button
            type="button"
            onClick={() => {
              setIsRegisterOpen((value) => !value);
              setRegisterError('');
            }}
            className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl bg-warm-gray px-3 text-sm font-semibold text-fawn-amber"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            注册账号
          </button>
        </form>

        {isRegisterOpen ? (
          <form
            onSubmit={onRegister}
            className="w-full rounded-card border border-oat-border bg-white p-5 shadow-card"
          >
            <div className="mb-4">
              <p className="text-sm text-dark-gray">邀请注册</p>
              <h2 className="mt-1 text-lg font-semibold text-soft-charcoal">创建家庭管理员</h2>
            </div>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">邀请码</span>
                <input
                  value={registerDraft.invite_code}
                  required
                  onChange={(event) => updateRegisterDraft('invite_code', event.target.value)}
                  className={authInputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">家庭名称</span>
                <input
                  value={registerDraft.family_name}
                  required
                  onChange={(event) => updateRegisterDraft('family_name', event.target.value)}
                  className={authInputClass}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-dark-gray">昵称</span>
                  <input
                    value={registerDraft.display_name}
                    required
                    onChange={(event) => updateRegisterDraft('display_name', event.target.value)}
                    className={authInputClass}
                  />
                </label>
                <div>
                  <span className="mb-1 block text-xs text-dark-gray">身份</span>
                  <div className="grid grid-cols-2 gap-1 rounded-input border border-oat-border bg-warm-gray p-1">
                    {(['爸爸', '妈妈'] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => updateRegisterDraft('role', role)}
                        className={`min-h-9 rounded-xl text-sm font-semibold ${
                          registerDraft.role === role ? 'bg-white text-fawn-amber shadow-card' : 'text-dark-gray'
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">账号名</span>
                <input
                  value={registerDraft.username}
                  required
                  autoComplete="username"
                  onChange={(event) => updateRegisterDraft('username', event.target.value)}
                  className={authInputClass}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">密码</span>
                <input
                  value={registerDraft.password}
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  onChange={(event) => updateRegisterDraft('password', event.target.value)}
                  className={authInputClass}
                />
              </label>
            </div>

            {registerError ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-safety-red-light px-3 py-2 text-sm text-safety-red">
                <AlertCircle className="h-4 w-4" aria-hidden />
                {registerError}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsRegisterOpen(false)}>
                取消
              </Button>
              <Button type="submit" loading={isRegistering}>
                创建
              </Button>
            </div>
          </form>
        ) : null}
      </div>
    </main>
  );
}
