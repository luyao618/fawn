import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { setUnauthorizedHandler } from '../lib/api';
import { fetchMe, login as loginRequest } from '../lib/auth';
import {
  StoredAccount,
  StoredUser,
  clearAllAccounts,
  getAccounts,
  getActiveAccount,
  removeAccount as removeStoredAccount,
  switchActiveAccount,
  updateActiveUser,
  upsertAndActivateAccount,
} from '../lib/tokenStorage';

interface AuthContextValue {
  user: StoredUser | null;
  accounts: StoredAccount[];
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /**
   * Increments every time the active family scope changes (login, switch,
   * remove-active, sign-out). Downstream queries can list this in their
   * dependency array to invalidate + refetch without restarting the app.
   */
  scopeVersion: number;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Switch to an already-stored account by user id. */
  switchAccount: (userId: string) => Promise<void>;
  /** Add a new account (logs in, stores it, switches to it). */
  addAccount: (username: string, password: string) => Promise<void>;
  /** Forget a stored account; if it was active, falls back to another. */
  forgetAccount: (userId: string) => Promise<void>;
  /** Force-refresh the cached account list from storage. */
  reloadAccounts: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [scopeVersion, setScopeVersion] = useState(0);
  const bumpedForUserRef = useRef<string | null>(null);

  const reloadAccounts = useCallback(async () => {
    setAccounts(await getAccounts());
  }, []);

  /** Bump scope only when the active user id actually changes. */
  const bumpScopeFor = useCallback((id: string | null) => {
    if (bumpedForUserRef.current === id) return;
    bumpedForUserRef.current = id;
    setScopeVersion((v) => v + 1);
  }, []);

  const applyActiveAccount = useCallback(
    (account: StoredAccount | null) => {
      setUser(account?.user ?? null);
      setStatus(account ? 'authenticated' : 'unauthenticated');
      bumpScopeFor(account?.user.id ?? null);
    },
    [bumpScopeFor],
  );

  const signOut = useCallback(async () => {
    await clearAllAccounts();
    setAccounts([]);
    applyActiveAccount(null);
  }, [applyActiveAccount]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Active account was just cleared by the response interceptor. Reload
      // the account list and fall back to whatever remains (or unauthenticated).
      void (async () => {
        const next = await getActiveAccount();
        await reloadAccounts();
        applyActiveAccount(next);
      })();
    });
    return () => setUnauthorizedHandler(null);
  }, [applyActiveAccount, reloadAccounts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getAccounts();
      if (cancelled) return;
      setAccounts(stored);
      const active = await getActiveAccount();
      if (cancelled) return;
      if (!active) {
        applyActiveAccount(null);
        return;
      }
      applyActiveAccount(active);
      try {
        const fresh = await fetchMe();
        if (cancelled) return;
        await updateActiveUser(fresh);
        setUser(fresh);
        setAccounts(await getAccounts());
      } catch {
        // Network or 401: 401 path is handled by the interceptor +
        // unauthorizedHandler. For other errors keep the cached user.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyActiveAccount]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await loginRequest(username, password);
      await upsertAndActivateAccount({ user: res.user, token: res.access_token });
      const next = await getAccounts();
      setAccounts(next);
      applyActiveAccount({ user: res.user, token: res.access_token });
    },
    [applyActiveAccount],
  );

  const addAccount = useCallback(
    async (username: string, password: string) => {
      // Same flow as signIn — server issues a fresh token, we store + activate
      // it. Existing accounts stay in storage so the user can switch back.
      await signIn(username, password);
    },
    [signIn],
  );

  const switchAccount = useCallback(
    async (userId: string) => {
      const account = await switchActiveAccount(userId);
      if (!account) return;
      applyActiveAccount(account);
      // Refresh the cached user payload for the newly active account.
      try {
        const fresh = await fetchMe();
        await updateActiveUser(fresh);
        setUser(fresh);
        setAccounts(await getAccounts());
      } catch {
        // Token may be expired; the interceptor will clear it on 401 and the
        // unauthorized handler will recover. For other errors leave cache.
      }
    },
    [applyActiveAccount],
  );

  const forgetAccount = useCallback(
    async (userId: string) => {
      const next = await removeStoredAccount(userId);
      setAccounts(await getAccounts());
      applyActiveAccount(next);
    },
    [applyActiveAccount],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accounts,
      status,
      scopeVersion,
      signIn,
      signOut,
      switchAccount,
      addAccount,
      forgetAccount,
      reloadAccounts,
    }),
    [
      user,
      accounts,
      status,
      scopeVersion,
      signIn,
      signOut,
      switchAccount,
      addAccount,
      forgetAccount,
      reloadAccounts,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
