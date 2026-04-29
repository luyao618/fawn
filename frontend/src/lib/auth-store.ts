'use client';

import { create } from 'zustand';
import { api, configureApiAuth } from './api';
import type { User } from './types';

const TOKEN_KEY = 'access_token';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

function readStoredToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function writeStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,

  async login(username, password) {
    set({ isLoading: true });
    try {
      const response = await api.login({ username, password });
      writeStoredToken(response.access_token);
      set({
        user: response.user,
        token: response.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      writeStoredToken(null);
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      throw error;
    }
  },

  logout() {
    writeStoredToken(null);
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  async refreshToken() {
    const response = await api.refreshToken();
    writeStoredToken(response.access_token);
    set({ token: response.access_token, isAuthenticated: true });
  },

  async loadFromStorage() {
    const token = readStoredToken();
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      return;
    }

    set({ token, isLoading: true });
    try {
      const user = await api.getMe();
      set({ user, token, isAuthenticated: true, isLoading: false });
    } catch {
      get().logout();
    }
  },
}));

configureApiAuth({
  getToken: () => useAuthStore.getState().token ?? readStoredToken(),
  onUnauthorized: () => useAuthStore.getState().logout(),
});
