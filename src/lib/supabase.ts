import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** False until .env has the project URL and publishable key; screens show a setup message instead of failing. */
export const supabaseConfigured = Boolean(url && key);

// The web build pre-renders in Node, where there is no storage; sessions only persist on a device or in a browser.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(url || 'http://localhost', key || 'missing-key', {
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
