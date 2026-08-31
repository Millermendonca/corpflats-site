import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Requests notification permissions, obtains an Expo push token,
 * and registers it with the API server.
 *
 * Call this once the user is authenticated. Silently no-ops when:
 * - Permission is denied
 * - Running on web or a simulator without push support
 * - EXPO_PUBLIC_PROJECT_ID is not configured (token registration skipped)
 *
 * To enable push on physical devices:
 *   1. Create an EAS project at https://expo.dev
 *   2. Set EXPO_PUBLIC_PROJECT_ID=<your-project-uuid> in the environment
 *   3. Build with `eas build` (or use Expo Go for development testing)
 */
export function usePushNotifications(userId: number | undefined) {
  const registered = useRef(false);

  useEffect(() => {
    if (!userId || registered.current) return;

    // Configure how foreground notifications are presented
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    registerForPushNotifications();
    registered.current = true;

    // Reset flag on logout so it re-registers on the next login
    return () => {
      registered.current = false;
    };
  }, [userId]);
}

async function registerForPushNotifications(): Promise<void> {
  // Push notifications are not supported on web
  if (Platform.OS === 'web') return;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[push] Notification permission denied');
      return;
    }

    // Resolve Expo/EAS project ID from multiple sources (in priority order):
    //  1. EXPO_PUBLIC_PROJECT_ID env variable (set this for production/EAS builds)
    //  2. eas.json projectId injected by EAS Build at build time
    //  3. app.json extra.eas.projectId
    const projectId: string | undefined =
      process.env.EXPO_PUBLIC_PROJECT_ID ??
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.log(
        '[push] No EAS project ID configured — push token registration skipped. ' +
          'Set EXPO_PUBLIC_PROJECT_ID to enable push notifications on physical devices.',
      );
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    if (!token) return;

    // Register with our API server
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
    const res = await fetch(`https://${domain}/api/push-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn('[push] Failed to register token:', body);
    } else {
      console.log('[push] Push token registered successfully');
    }
  } catch (err) {
    // Non-critical — push is best-effort; never crash the app
    console.warn('[push] Could not register for push notifications:', err);
  }
}

/**
 * Removes the current device's push token from the server.
 * Call this on logout so notifications stop arriving on the signed-out device.
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const projectId: string | undefined =
      process.env.EXPO_PUBLIC_PROJECT_ID ??
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) return;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);
    if (!tokenData?.data) return;

    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
    await fetch(`https://${domain}/api/push-tokens`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: tokenData.data }),
    });
  } catch {
    // Best-effort cleanup
  }
}
