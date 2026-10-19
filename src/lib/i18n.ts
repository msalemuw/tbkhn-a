import { I18nManager, Platform } from 'react-native';

import { ar } from '@/lib/ar';

// English and Arabic (Egyptian). The layout direction is the language: Arabic is right-to-left, English left-to-right.
// Reading the direction at start-up gives the language synchronously, before the first screen is drawn, so any file can call t().
// Changing language flips the direction and reloads the app (the only way React Native applies a new direction).

export type Lang = 'en' | 'ar';

export const lang: Lang = Platform.OS !== 'web' && I18nManager.isRTL ? 'ar' : 'en';
export const isRTL = lang === 'ar';

/**
 * Translate an English UI string. Missing Arabic text falls back to the English, so a screen is never blank.
 * Values go in {name} slots: t('{n} left', { n: 3 }).
 */
export function t(en: string, vars?: Record<string, string | number>): string {
  const text = lang === 'ar' ? (ar[en] ?? en) : en;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : text;
}

/** Switch language: stores the direction natively, then reloads. Not on web, where the direction comes from the page. */
export async function setLanguage(next: Lang): Promise<void> {
  if (Platform.OS === 'web' || next === lang) return;
  const rtl = next === 'ar';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  const Updates = await import('expo-updates');
  await Updates.reloadAsync();
}
