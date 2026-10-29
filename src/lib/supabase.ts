import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** False until .env has the project URL and publishable key; screens show a setup message instead of failing. */
export const supabaseConfigured = Boolean(url && key);

// The web build pre-renders in Node, where there is no storage; sessions only persist on a device or in a browser.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

// A request on a bad connection could otherwise wait forever and leave a screen loading. After the limit it fails like any other
// error, and each screen already shows its empty or error state for that. Photo uploads get longer.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const limit = target.includes('/storage/') ? 120000 : 30000;
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), limit);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) timer.abort();
    else outer.addEventListener('abort', () => timer.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: timer.signal }).finally(() => clearTimeout(timeout));
}

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
  global: { fetch: fetchWithTimeout },
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    persistSession: !isServer,
    autoRefreshToken: !isServer,
    detectSessionInUrl: false,
  },
});

// Refresh the session only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
