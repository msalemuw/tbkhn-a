import { Platform } from 'react-native';

import { logFunnel } from '@/lib/funnel';
import { supabase } from '@/lib/supabase';

// Google and Apple sign-in (launch sign-in, section 13). Both hand Supabase an ID token. The native
// modules are loaded when used, so Expo Go and the web build still start without them.

export type OAuthMethod = 'google' | 'apple';
export type OAuthResult = { ok: true; userId: string } | { ok: false; cancelled?: boolean; message: string };

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Phone code sign-in (WhatsApp) stays off until a real WhatsApp number is set up. */
export const PHONE_SIGNIN = process.env.EXPO_PUBLIC_PHONE_SIGNIN === '1';
/** Google needs its client ID from Google Cloud; until then the button stays hidden. */
export const GOOGLE_SIGNIN = Platform.OS !== 'web' && Boolean(GOOGLE_WEB_CLIENT_ID);
/** Apple sign-in is iOS only, and App Store rules require it next to Google. */
export const APPLE_SIGNIN = Platform.OS === 'ios';

const FAILED = 'We couldn’t sign you in. Check your connection and try again.';

async function finish(method: OAuthMethod, started: number, token: string, nonce?: string, fullName?: string): Promise<OAuthResult> {
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: method, token, nonce });
  logFunnel(
    'signup_method_chosen',
    { method, result: error ? 'error' : 'ok' },
    { latencyMs: Date.now() - started, errorCode: error?.code, userRef: data.user?.id },
  );
  if (error || !data.user) return { ok: false, message: FAILED };
  // Apple only shares the name the first time; keep it so the profile step can prefill it.
  if (fullName) await supabase.auth.updateUser({ data: { full_name: fullName } });
  return { ok: true, userId: data.user.id };
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  if (!GOOGLE_SIGNIN) return { ok: false, message: 'Google sign-in isn’t available yet.' };
  const started = Date.now();
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') return { ok: false, cancelled: true, message: '' };
    const token = res.data.idToken;
    if (!token) return { ok: false, message: FAILED };
    return await finish('google', started, token);
  } catch {
    return { ok: false, message: FAILED };
  }
}

export async function signInWithApple(): Promise<OAuthResult> {
  if (!APPLE_SIGNIN) return { ok: false, message: 'Apple sign-in isn’t available on this device.' };
  const started = Date.now();
  try {
    const Apple = await import('expo-apple-authentication');
    const Crypto = await import('expo-crypto');
    // Apple gets the hash of a random value; Supabase checks the original against the token.
    const nonce = Crypto.randomUUID();
    const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
    const credential = await Apple.signInAsync({
      requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!credential.identityToken) return { ok: false, message: FAILED };
    const fullName = credential.fullName ? Apple.formatFullName(credential.fullName) : undefined;
    return await finish('apple', started, credential.identityToken, nonce, fullName || undefined);
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { ok: false, cancelled: true, message: '' };
    return { ok: false, message: FAILED };
  }
}
