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
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
  unregisterPushNotificationsWithAuthAsync,
} from '../lib/pushNotifications';
import {
  StoredAccount,
  StoredUser,
  clearAllAccounts,
  getAccounts,
  getActiveAccount,
  getActiveUserId,
  removeAccount as removeStoredAccount,
  switchActiveAccount,
  updateActiveUser,
  upsertAndActivateAccount,
} from '../lib/tokenStorage';
import { clearPersistedQueryCache, queryClient } from '../shared/query';

// Drop both the in-memory QueryClient cache and the MMKV-persisted dehydrated
// cache. We do this on logout AND on a 401 so the next user can never see the
// previous user's data restored from the persister (data isolation).
function wipeQueryCaches() {
  queryClient.clear();
  clearPersistedQueryCache();
}

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
  // Track the Expo push token currently registered with the backend so we
  // can DELETE it on sign-out / before re-registering for a new user. Keyed
  // by userId because each user owns their own backend (user, token) row.
  const registeredTokenRef = useRef<{ userId: string; token: string } | null>(null);

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
    // Unregister whatever push token we currently hold so the backend
    // stops fanning out to this device for the just-signed-out user. The
    // request runs against the soon-to-be-cleared token; do it before
    // clearAllAccounts() so the Bearer header is still valid.
    const registered = registeredTokenRef.current;
    if (registered) {
      await unregisterPushNotificationsAsync(registered.token);
      registeredTokenRef.current = null;
    }
    await clearAllAccounts();
    wipeQueryCaches();
    setAccounts([]);
    applyActiveAccount(null);
  }, [applyActiveAccount]);

  useEffect(() => {
    setUnauthorizedHandler((capturedUserId) => {
      // The response interceptor removed whichever stored account actually
      // got the 401 (identified by the userId captured at request-build time).
      // If that account was the active one, removeAccount() already fell the
      // active pointer back to another stored account or null. Reload state
      // from storage either way; but only apply a new active account when
      // the 401 affected the currently-active user — otherwise we'd clobber
      // a perfectly good post-switch session.
      void (async () => {
        const currentActiveId = await getActiveUserId();
        await reloadAccounts();
        // capturedUserId === null is the legacy fallback path: treat as
        // "current active was unauthenticated".
        const affectedActive =
          capturedUserId === null || capturedUserId === bumpedForUserRef.current;
        if (affectedActive) {
          // Drop in-memory + persisted query caches so the next user (or
          // re-login) can never see the previous user's data.
          wipeQueryCaches();
          const next = currentActiveId ? await getActiveAccount() : null;
          applyActiveAccount(next);
        }
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

  /**
   * Revoke the currently-registered push token (if any) under the
   * supplied previous-user auth context, before the active account is
   * allowed to flip. The backend's `DELETE /push/tokens` is scoped to
   * the authenticated owner — if we let it run under the new user's
   * Bearer it silently no-ops and the old user keeps receiving pushes
   * for this device.
   */
  const revokePreviousPushTokenBeforeSwitch = useCallback(
    async (previousAuthToken: string | null) => {
      const registered = registeredTokenRef.current;
      if (!registered || !previousAuthToken) return;
      await unregisterPushNotificationsWithAuthAsync(
        previousAuthToken,
        registered.token,
      );
      registeredTokenRef.current = null;
    },
    [],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await loginRequest(username, password);
      // If a different user is currently active, revoke their device
      // push token under THEIR auth context first. Doing this after
      // upsertAndActivateAccount() would send the DELETE under the new
      // user's Bearer and the backend owner-scope check would no-op it.
      const previous = await getActiveAccount();
      if (previous && previous.user.id !== res.user.id) {
        await revokePreviousPushTokenBeforeSwitch(previous.token);
      }
      await upsertAndActivateAccount({ user: res.user, token: res.access_token });
      const next = await getAccounts();
      setAccounts(next);
      applyActiveAccount({ user: res.user, token: res.access_token });
    },
    [applyActiveAccount, revokePreviousPushTokenBeforeSwitch],
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
      // Revoke the previous user's device push token under their own
      // auth context BEFORE switchActiveAccount() flips the active
      // pointer. Skip when switching to the already-active user (a no-op
      // switch shouldn't drop the registration).
      const previous = await getActiveAccount();
      if (previous && previous.user.id !== userId) {
        await revokePreviousPushTokenBeforeSwitch(previous.token);
      }
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
    [applyActiveAccount, revokePreviousPushTokenBeforeSwitch],
  );

  const forgetAccount = useCallback(
    async (userId: string) => {
      const next = await removeStoredAccount(userId);
      setAccounts(await getAccounts());
      applyActiveAccount(next);
    },
    [applyActiveAccount],
  );

  /**
   * Register an Expo push token with the backend each time the active
   * user changes (login, switch, scope bump). Re-registration is an
   * upsert server-side, so it's safe to re-run. Revocation of the
   * *previous* user's token is NOT done here — that has to happen
   * before the active account flips so the DELETE runs under the
   * previous owner's auth (see `revokePreviousPushTokenBeforeSwitch`).
   */
  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      return;
    }
    const targetUserId = user.id;
    let cancelled = false;
    (async () => {
      const result = await registerForPushNotificationsAsync();
      if (cancelled) return;
      if (result.token) {
        registeredTokenRef.current = { userId: targetUserId, token: result.token };
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user, scopeVersion]);

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
