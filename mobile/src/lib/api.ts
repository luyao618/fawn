import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';

import { getToken, getActiveUserId, removeAccount } from './tokenStorage';

type Unauthorized = () => void;

const DEFAULT_BASE_URL = 'http://10.0.2.2:8000';

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
  const token = await getToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const activeId = await getActiveUserId();
      if (activeId) {
        await removeAccount(activeId);
      }
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(error);
  },
);

export function getApiBaseUrl(): string {
  return resolveBaseUrl();
}
