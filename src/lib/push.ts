import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { canRing } from '@/lib/ring';
import { supabase } from '@/lib/supabase';

// Phone alerts (push notifications). The native module only exists in builds made after it was added,
// so it is loaded defensively: older installs simply skip alerts instead of crashing.
type Notifications = typeof import('expo-notifications');

function load(): Notifications | null {
  // A failed require() reports a fatal error to the app even inside try/catch, so the native part is checked first.
  if (!requireOptionalNativeModule('ExpoPushTokenManager')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as Notifications;
  } catch {
    return null;
  }
}

/** Opens the screen an alert points to. Never throws and waits a moment so the app is ready to navigate. */
function open(data: unknown) {
  try {
    const url = (data as { url?: string } | null)?.url;
    if (url && url.startsWith('/')) {
      setTimeout(() => {
        try {
          router.push(url as never);
        } catch {
          // A bad link must never close the app.
        }
      }, 800);
    }
  } catch {
    // ignore
  }
}

/** True for an alert tapped within the last two minutes, so an old tap is never replayed on every launch. */
function isFresh(date: unknown): boolean {
  if (typeof date !== 'number') return false;
  const ms = date > 1e12 ? date : date * 1000;
  return Date.now() - ms < 120_000;
}

let wired = false;

/** Asks for permission, registers this phone for the signed-in person and opens the right screen when an alert is tapped. */
export async function registerForPush(): Promise<void> {
  const N = load();
  if (!N || !Device.isDevice) return;
  try {
    if (!wired) {
      wired = true;
      // While the app is open the in-app banner (LiveAlerts) shows the alert, so the system only adds the sound.
      N.setNotificationHandler({
        handleNotification: async (n) => {
          // New requests ring through the app itself (src/lib/ring.ts) when this build can, so the phone's own sound is not doubled.
          const kind = (n.request.content.data as { kind?: string } | null)?.kind;
          const appRings = canRing() && (kind === 'order_new' || kind === 'order_reminder');
          return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: !appRings, shouldSetBadge: false };
        },
      });
      N.addNotificationResponseReceivedListener((r) => {
        try {
          open(r.notification.request.content.data);
        } catch {
          // ignore
        }
      });
      const last = N.getLastNotificationResponse();
      if (last) {
        if (isFresh(last.notification.date)) open(last.notification.request.content.data);
        N.clearLastNotificationResponse();
      }
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

export type AlertHealth = 'ok' | 'off' | 'silent' | 'unknown';

/** Can this phone show and sound alerts from the app? 'off' = notifications refused, 'silent' = shown without sound. */
export async function checkAlerts(): Promise<AlertHealth> {
  const N = load();
  if (!N || !Device.isDevice) return 'unknown';
  try {
    const p = await N.getPermissionsAsync();
    if (p.status !== 'granted') return 'off';
    if (Platform.OS === 'ios' && p.ios && p.ios.allowsSound === false) return 'silent';
    return 'ok';
  } catch {
    return 'unknown';
  }
}

/** The number on the app icon (waiting requests). Ignored on phones whose build has no alerts. */
export async function setIconBadge(n: number): Promise<void> {
  const N = load();
  if (!N) return;
  try {
    await N.setBadgeCountAsync(Math.max(0, n));
  } catch {
    // The badge is a bonus; never block the app.
  }
}
