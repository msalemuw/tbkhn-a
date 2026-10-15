import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Phone alerts (push notifications). The native module only exists in builds made after it was added,
// so it is loaded defensively: older installs simply skip alerts instead of crashing.
type Notifications = typeof import('expo-notifications');

function load(): Notifications | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as Notifications;
  } catch {
    return null;
  }
}

function open(data: unknown) {
  const url = (data as { url?: string } | null)?.url;
  if (url) router.push(url as never);
}

let wired = false;

/** Asks for permission, registers this phone for the signed-in person and opens the right screen when an alert is tapped. */
export async function registerForPush(): Promise<void> {
  const N = load();
  if (!N || !Device.isDevice) return;
  try {
    if (!wired) {
      wired = true;
      // The in-app banner covers the app being open, so the system shows nothing in the foreground.
      N.setNotificationHandler({
        handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
      });
      N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
      const last = N.getLastNotificationResponse();
      if (last) open(last.notification.request.content.data);
    }
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'Orders and messages', importance: N.AndroidImportance.MAX });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await N.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  } catch {
    // Alerts are a bonus; never block the app.
  }
}
