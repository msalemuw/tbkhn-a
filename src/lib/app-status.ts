import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

/** What staff can switch from the admin website (Controls tab). */
export type AppStatus = {
  maintenance: boolean;
  maintenance_message: string | null;
  min_app_version: string;
  ordering_enabled: boolean;
  posting_enabled: boolean;
  /** Menu tab on/off; while off the tab shows `menu_message` instead of the dishes. */
  menu_enabled?: boolean;
  menu_message?: string | null;
};

/** True when `version` is older than `min` (1.0.9 < 1.0.10). An empty minimum allows every version. */
export function isOlderVersion(version: string, min: string): boolean {
  if (!min) return false;
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

export const installedVersion = Constants.expoConfig?.version ?? '0.0.0';

/** Reads the switches. A network or server problem returns null, so nobody is locked out by a failed check. */
export async function fetchAppStatus(): Promise<AppStatus | null> {
  try {
    const { data, error } = await supabase.rpc('app_status');
    if (error || !data) return null;
    return data as AppStatus;
  } catch {
    return null;
  }
}

/** The screen to show instead of the app, or null when the app can open. */
export function blockReason(status: AppStatus | null): { title: string; text: string } | null {
  if (!status) return null;
  if (status.maintenance) return { title: 'Back soon', text: status.maintenance_message || 'tabkheen A is being updated. Please try again in a little while.' };
  if (isOlderVersion(installedVersion, status.min_app_version)) {
    return { title: 'Please update', text: `This version of tabkheen A (${installedVersion}) is no longer supported. Update the app from the App Store or Google Play to continue.` };
  }
  return null;
}

export const MENU_CLOSED_FALLBACK = 'Today’s menu is coming soon. We are getting our cooks ready. Stay tuned!';
