import { I18nManager, Platform } from 'react-native';

import { ar } from '@/lib/ar';
import { arPatterns, localizeUnits } from '@/lib/ar-patterns';

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

// Section labels are often shown in capitals ("CAPTION"), so a lower-case lookup finds them too.
const norm = (x: string) => x.replace(/'/g, '’').toLowerCase();
const arLower: Record<string, string> = Object.fromEntries(Object.entries(ar).map(([k, v]) => [norm(k), v]));

function lookup(body: string): string | undefined {
  const exact = ar[body] ?? arLower[norm(body)];
  if (exact !== undefined) return exact;
  for (const [re, to] of arPatterns) {
    const m = re.exec(body);
    if (m) return typeof to === 'function' ? to(...m) : body.replace(re, to);
  }
  const optional = /^(.+) \(optional\)$/i.exec(body);
  if (optional && lookup(optional[1]) !== undefined) return `${lookup(optional[1])} (اختياري)`;
  // "Feed filter: Everyone": a label and a value that are each known.
  const labelled = /^([^:]{2,40}): (.+)$/.exec(body);
  if (labelled && lookup(labelled[1]) !== undefined) return `${lookup(labelled[1])}: ${lookup(labelled[2]) ?? labelled[2]}`;
  // "Egyptian · Chicken · 3 left", "You: Payment sent": translate the parts that are known.
  if (body.startsWith('You: ')) return `إنت: ${tr(body.slice(5))}`;
  if (body.includes(' · ')) {
    const parts = body.split(' · ');
    const done = parts.map((x) => lookup(x));
    if (done.some((x) => x !== undefined)) return parts.map((x, i) => done[i] ?? x).join(' · ');
  }
  return undefined;
}

/**
 * Translate any piece of UI text: an exact match in ar.ts, else a pattern for text with numbers or names in it (ar-patterns.ts).
 * Leading and trailing spaces are kept, so pieces of a sentence can be translated one by one. Unknown text stays as written.
 */
export function tr(text: string): string {
  if (lang !== 'ar' || !text) return text;
  const body = text.trim();
  if (!body) return text;
  const hit = lookup(body);
  if (hit === undefined) return localizeUnits(text);
  const start = text.indexOf(body);
  return text.slice(0, start) + localizeUnits(hit) + text.slice(start + body.length);
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
