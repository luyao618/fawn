// Push token registration API — mirrors backend/src/fawn/api/push.py.
//
//   POST   /push/tokens   { token, platform, device_id? }   -> PushTokenRead
//   DELETE /push/tokens   { token }                          -> 204
//
// Auth is implicit via the shared axios instance (Bearer token attached by
// the request interceptor).

import { api } from './client';

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
