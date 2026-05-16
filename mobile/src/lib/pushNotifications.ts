// Expo push notifications integration.
//
// Lifecycle (called from AuthContext after a successful sign-in / scope
// change):
//   1. Ensure POST_NOTIFICATIONS / iOS permission is granted.
//   2. Ask Expo for the current Expo push token (FCM under the hood on
//      Android).
//   3. POST it to `/push/tokens` so the backend can fan out to this device.
//   4. Persist the token locally so we can DELETE it on sign-out.
//
// Tap routing:
//   - `useNotifications()` installs a single global response listener +
//     processes a cold-start tap via `getLastNotificationResponseAsync`.
//   - The listener decodes the payload via `intentFromPushData` and hands
//     it to the deep-link bus.
//
// Constraints honored:
//   - Expo Go cannot deliver real push notifications (it has no managed
//     project of its own here), so registration is a no-op when running
//     under Expo Go or on a simulator. The auth flow still succeeds.
//   - We never throw out of the registration path — push failure must not
//     break login.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken, unregisterPushTokenWithAuth } from '../shared/api/push';
import { intentFromPushData, publishIntent } from './deepLinks';

// Foreground behavior: show the banner + play sound even when the app is
// open, so the user gets a consistent signal regardless of state.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let configuredAndroidChannel = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || configuredAndroidChannel) return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Fawn 通知',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    lightColor: '#2c7a4b',
  });
  configuredAndroidChannel = true;
}

function isPushCapable(): boolean {
  // Real push requires a physical device AND a dev/standalone build (not
  // Expo Go, which dropped push in SDK 53+).
  if (!Device.isDevice) return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return false;
  }
  return true;
}

function expoProjectId(): string | undefined {
  // Required on SDK 49+; falls back to the legacy slot for safety.
  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExpoConfig === 'string' && fromExpoConfig.length > 0) {
    return fromExpoConfig;
  }
  const fromEasConfig = (Constants as unknown as {
    easConfig?: { projectId?: string };
  }).easConfig?.projectId;
  if (typeof fromEasConfig === 'string' && fromEasConfig.length > 0) {
    return fromEasConfig;
  }
  return undefined;
}

async function requestPermissions(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  if (settings.canAskAgain === false) return false;
  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return next.granted || next.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export interface RegisterResult {
  token: string | null;
  /** Reason we didn't (or couldn't) register; useful for logs/settings UI. */
  skipped?:
    | 'simulator_or_expo_go'
    | 'permission_denied'
    | 'no_token_returned'
    | 'register_failed';
}

/**
 * Acquire an Expo push token for this device and POST it to the backend.
 * Safe to call multiple times (per-user); repeated calls upsert.
 *
 * Returns the token (or null when we couldn't register) so the caller can
 * persist it for later unregister.
 */
export async function registerForPushNotificationsAsync(): Promise<RegisterResult> {
  if (!isPushCapable()) {
    return { token: null, skipped: 'simulator_or_expo_go' };
  }
  await ensureAndroidChannel();
  const granted = await requestPermissions();
  if (!granted) {
    return { token: null, skipped: 'permission_denied' };
  }
  let token: string;
  try {
    const projectId = expoProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    token = tokenResponse.data;
  } catch {
    // Most common cause: no `extra.eas.projectId` configured. The build
    // is still functional, push is just not available yet.
    return { token: null, skipped: 'no_token_returned' };
  }
  if (!token) return { token: null, skipped: 'no_token_returned' };

  const platform: 'android' | 'ios' = Platform.OS === 'ios' ? 'ios' : 'android';
  try {
    await registerPushToken({
      token,
      platform,
      device_id: Device.osInternalBuildId ?? Device.modelId ?? null,
    });
    return { token };
  } catch {
    // Network / 4xx — surface "register_failed" so the caller can retry
    // on next sign-in or scope change without crashing the auth flow.
    return { token: null, skipped: 'register_failed' };
  }
}

/** Best-effort unregister; swallow errors (token may already be gone). */
export async function unregisterPushNotificationsAsync(token: string): Promise<void> {
  try {
    await unregisterPushToken(token);
  } catch {
    // Ignore — sign-out / scope-switch must not block on push cleanup.
  }
}

/**
 * Best-effort unregister under an explicit Bearer auth context. Use this
 * when deleting the *previous* user's push token during an account
 * switch: the backend scopes the DELETE to the authenticated owner, so
 * the request must run before the active account flips (or with the old
 * account's auth token, as we do here).
 */
export async function unregisterPushNotificationsWithAuthAsync(
  authToken: string,
  pushToken: string,
): Promise<void> {
  try {
    await unregisterPushTokenWithAuth(authToken, pushToken);
  } catch {
    // Ignore — account switch / sign-in must not block on push cleanup.
  }
}

/**
 * Hook: install the foreground + tap listeners exactly once for the app's
 * lifetime. Also drains the cold-start notification (the one the user
 * tapped to launch the app), if any.
 */
export function useNotifications(): void {
  useEffect(() => {
    let mounted = true;
    // 1. Cold-start tap.
    (async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (!mounted || !response) return;
      const intent = intentFromPushData(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (intent) publishIntent(intent);
    })();

    // 2. Warm-state taps.
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const intent = intentFromPushData(
          response.notification.request.content.data as Record<string, unknown>,
        );
        if (intent) publishIntent(intent);
      },
    );

    return () => {
      mounted = false;
      responseSub.remove();
    };
  }, []);
}
