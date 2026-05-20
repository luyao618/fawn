import { api } from './api';
import { StoredUser } from './tokenStorage';
import type { Family } from './types';

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: StoredUser;
}

export interface RegistrationRequest {
  invite_code: string;
  family_name: string;
  username: string;
  password: string;
  display_name: string;
  role: '爸爸' | '妈妈';
}

export interface RegistrationResponse {
  family: Family;
  user: StoredUser;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
  return data;
}

export async function registerFamily(payload: RegistrationRequest): Promise<RegistrationResponse> {
  const { data } = await api.post<RegistrationResponse>('/auth/register', payload);
  return data;
}

export async function fetchMe(): Promise<StoredUser> {
  const { data } = await api.get<StoredUser>('/auth/me');
  return data;
}

/** Members of the current user's family (server scopes by the active token). */
export async function fetchFamilyMembers(): Promise<StoredUser[]> {
  const { data } = await api.get<StoredUser[]>('/users');
  return data;
}
