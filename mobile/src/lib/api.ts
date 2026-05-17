import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

import { getActiveAccount, getActiveUserId, removeAccount } from './tokenStorage';

// Extend axios request config so we can remember which stored userId actually
// signed a given request. The 401 handler relies on this to avoid a race where
// the user switches accounts before an in-flight request's 401 comes back.
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _authUserId?: string | null;
  }
}

type Unauthorized = (capturedUserId: string | null) => void;

const DEFAULT_BASE_URL = 'https://lumingchuan.vip/api';

function resolveBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.apiBaseUrl;
  if (typeof fromExtra === 'string' && fromExtra.length > 0) return fromExtra;
  return DEFAULT_BASE_URL;
}

let unauthorizedHandler: Unauthorized | null = null;

export function setUnauthorizedHandler(handler: Unauthorized | null): void {
  unauthorizedHandler = handler;
}

export const api: AxiosInstance = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 15000,
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // Snapshot the active account at request-build time so a later 401 can be
  // attributed to the exact account that signed this request, even if the
  // user has since switched to a different account.
  const active = await getActiveAccount();
  config._authUserId = active?.user.id ?? null;
  if (active?.token) {
    config.headers.set('Authorization', `Bearer ${active.token}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const capturedUserId = error.config?._authUserId ?? null;
      const activeId = await getActiveUserId();
      if (capturedUserId) {
        // Always drop the account whose token actually got a 401, regardless
        // of whether it's still the active one. removeAccount() will only
        // touch activeUserId when that captured id IS the current active.
        await removeAccount(capturedUserId);
      } else if (activeId) {
        // No captured id (request built before this fix or outside the
        // interceptor) — fall back to old behavior on the current active.
        await removeAccount(activeId);
      }
      if (unauthorizedHandler) unauthorizedHandler(capturedUserId);
    }
    return Promise.reject(error);
  },
);

export function getApiBaseUrl(): string {
  return resolveBaseUrl();
}
