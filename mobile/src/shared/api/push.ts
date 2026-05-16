// Push token registration API — mirrors backend/src/fawn/api/push.py.
//
//   POST   /push/tokens   { token, platform, device_id? }   -> PushTokenRead
//   DELETE /push/tokens   { token }                          -> 204
//
// Auth is implicit via the shared axios instance (Bearer token attached by
// the request interceptor). For the account-switch path we also expose
// `unregisterPushTokenWithAuth` which takes an explicit Bearer token so
// the caller can DELETE a previous user's token *before* the active
// account flips — otherwise the request would go out under the new
// user's Bearer and the backend's owner-scope check would no-op it.

import axios from 'axios';

import { api } from './client';
import { getApiBaseUrl } from '../../lib/api';

export type PushPlatform = 'android' | 'ios';

export interface PushTokenRead {
  id: string;
  token: string;
  platform: PushPlatform;
  device_id: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PushTokenRegisterBody {
  token: string;
  platform: PushPlatform;
  device_id?: string | null;
}

export async function registerPushToken(
  body: PushTokenRegisterBody,
): Promise<PushTokenRead> {
  const { data } = await api.post<PushTokenRead>('/push/tokens', body);
  return data;
}

export async function unregisterPushToken(token: string): Promise<void> {
  await api.delete('/push/tokens', { data: { token } });
}

/**
 * DELETE a push token under an explicitly-supplied Bearer auth token,
 * bypassing the shared axios instance's "current active account" interceptor.
 *
 * Used during account-switch / re-login: the old account's Expo push token
 * must be deleted *as that user*, because the backend scopes
 * `DELETE /push/tokens` to the authenticated owner. If we let the shared
 * client run after the active account has flipped, the request would go
 * out under the new user's Bearer and silently no-op.
 */
export async function unregisterPushTokenWithAuth(
  authToken: string,
  pushToken: string,
): Promise<void> {
  await axios.request({
    baseURL: getApiBaseUrl(),
    url: '/push/tokens',
    method: 'delete',
    headers: { Authorization: `Bearer ${authToken}` },
    data: { token: pushToken },
    timeout: 15000,
  });
}
