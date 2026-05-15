import { api } from './api';
import { StoredUser } from './tokenStorage';

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: StoredUser;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
  return data;
}

export async function fetchMe(): Promise<StoredUser> {
  const { data } = await api.get<StoredUser>('/auth/me');
  return data;
}
