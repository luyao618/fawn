import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { setUnauthorizedHandler } from '../lib/api';
import { fetchMe, login as loginRequest } from '../lib/auth';
import {
  StoredUser,
  clearToken,
  clearUser,
  getToken,
  getUser,
  saveToken,
  saveUser,
} from '../lib/tokenStorage';

interface AuthContextValue {
  user: StoredUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');

  const signOut = useCallback(async () => {
    await clearToken();
    await clearUser();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('unauthenticated');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setStatus('unauthenticated');
        return;
      }
      const cached = await getUser();
      if (cached && !cancelled) setUser(cached);
      try {
        const fresh = await fetchMe();
        if (cancelled) return;
        await saveUser(fresh);
        setUser(fresh);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        // Token invalid or network error. If we had cached user, treat as authenticated
        // so user isn't kicked out on transient network failures; the response interceptor
        // already handled true 401s by clearing storage.
        const stillHasToken = await getToken();
        if (stillHasToken && cached) {
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await loginRequest(username, password);
    await saveToken(res.access_token);
    await saveUser(res.user);
    setUser(res.user);
    setStatus('authenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signOut }),
    [user, status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
