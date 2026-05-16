import * as SecureStore from 'expo-secure-store';

const LEGACY_TOKEN_KEY = 'fawn.auth.token';
const LEGACY_USER_KEY = 'fawn.auth.user';
const ACCOUNTS_KEY = 'fawn.auth.accounts';
const ACTIVE_USER_ID_KEY = 'fawn.auth.activeUserId';

export interface StoredUser {
  id: string;
  family_id: string;
  username: string;
  display_name: string;
  access_type: string;
  role: string;
  avatar_url: string | null;
  permissions: Record<string, boolean>;
}

export interface StoredAccount {
  user: StoredUser;
  token: string;
}

interface AccountsBlob {
  version: 1;
  accounts: StoredAccount[];
}

async function readAccountsBlob(): Promise<StoredAccount[]> {
  const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
  if (!raw) {
    // Migrate single-account legacy storage if present.
    const legacyToken = await SecureStore.getItemAsync(LEGACY_TOKEN_KEY);
    const legacyUserRaw = await SecureStore.getItemAsync(LEGACY_USER_KEY);
    if (legacyToken && legacyUserRaw) {
      try {
        const user = JSON.parse(legacyUserRaw) as StoredUser;
        const migrated: StoredAccount[] = [{ user, token: legacyToken }];
        await writeAccountsBlob(migrated);
        await SecureStore.setItemAsync(ACTIVE_USER_ID_KEY, user.id);
        await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY);
        await SecureStore.deleteItemAsync(LEGACY_USER_KEY);
        return migrated;
      } catch {
        return [];
      }
    }
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as AccountsBlob;
    if (parsed && Array.isArray(parsed.accounts)) return parsed.accounts;
    return [];
  } catch {
    return [];
  }
}

async function writeAccountsBlob(accounts: StoredAccount[]): Promise<void> {
  const blob: AccountsBlob = { version: 1, accounts };
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(blob));
}

export async function getAccounts(): Promise<StoredAccount[]> {
  return readAccountsBlob();
}

export async function getActiveUserId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_USER_ID_KEY);
}

async function setActiveUserIdRaw(id: string | null): Promise<void> {
  if (id === null) {
    await SecureStore.deleteItemAsync(ACTIVE_USER_ID_KEY);
  } else {
    await SecureStore.setItemAsync(ACTIVE_USER_ID_KEY, id);
  }
}

export async function getActiveAccount(): Promise<StoredAccount | null> {
  const id = await getActiveUserId();
  if (!id) return null;
  const accounts = await readAccountsBlob();
  return accounts.find((a) => a.user.id === id) ?? null;
}

export async function getToken(): Promise<string | null> {
  const active = await getActiveAccount();
  return active?.token ?? null;
}

export async function getUser(): Promise<StoredUser | null> {
  const active = await getActiveAccount();
  return active?.user ?? null;
}

/**
 * Insert or update an account by user id, then make it active.
 * This is what we call after a successful login.
 */
export async function upsertAndActivateAccount(account: StoredAccount): Promise<void> {
  const accounts = await readAccountsBlob();
  const idx = accounts.findIndex((a) => a.user.id === account.user.id);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  await writeAccountsBlob(accounts);
  await setActiveUserIdRaw(account.user.id);
}

/**
 * Update the cached user payload for the active account (e.g. after /auth/me).
 */
export async function updateActiveUser(user: StoredUser): Promise<void> {
  const accounts = await readAccountsBlob();
  const idx = accounts.findIndex((a) => a.user.id === user.id);
  if (idx < 0) return;
  accounts[idx] = { ...accounts[idx], user };
  await writeAccountsBlob(accounts);
}

/**
 * Switch to a previously stored account. Returns the activated account, or null
 * if there is no stored account with that id.
 */
export async function switchActiveAccount(userId: string): Promise<StoredAccount | null> {
  const accounts = await readAccountsBlob();
  const match = accounts.find((a) => a.user.id === userId);
  if (!match) return null;
  await setActiveUserIdRaw(userId);
  return match;
}

/**
 * Remove an account from storage. If it was active, pick another stored account
 * as the new active one, or clear active id if no accounts remain.
 * Returns the new active account (or null).
 */
export async function removeAccount(userId: string): Promise<StoredAccount | null> {
  const accounts = await readAccountsBlob();
  const remaining = accounts.filter((a) => a.user.id !== userId);
  await writeAccountsBlob(remaining);
  const activeId = await getActiveUserId();
  if (activeId === userId) {
    const next = remaining[0] ?? null;
    await setActiveUserIdRaw(next?.user.id ?? null);
    return next;
  }
  return accounts.find((a) => a.user.id === activeId) ?? null;
}

/** Clear all accounts (full sign-out). */
export async function clearAllAccounts(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCOUNTS_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_USER_ID_KEY);
}
