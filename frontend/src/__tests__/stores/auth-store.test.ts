import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/lib/auth-store';

describe('auth-store', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCK = 'true';
    window.localStorage.clear();
    useAuthStore.getState().logout();
  });

  it('logs in and persists token', async () => {
    await useAuthStore.getState().login('mama', 'password');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.username).toBe('mama');
    expect(window.localStorage.getItem('access_token')).toBe('mock-token-mama');
  });

  it('clears state on logout', async () => {
    await useAuthStore.getState().login('mama', 'password');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem('access_token')).toBeNull();
  });

  it('restores from valid storage and clears invalid tokens', async () => {
    window.localStorage.setItem('access_token', 'mock-token-mama');
    await useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    window.localStorage.setItem('access_token', 'bad-token');
    await useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.localStorage.getItem('access_token')).toBeNull();
  });

  it('rejects invalid credentials', async () => {
    await expect(useAuthStore.getState().login('mama', 'wrong')).rejects.toThrow('用户名或密码错误');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
