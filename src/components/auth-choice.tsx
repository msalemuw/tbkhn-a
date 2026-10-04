import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader, formStyles } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { APPLE_SIGNIN, GOOGLE_SIGNIN, type OAuthMethod, type OAuthResult, PHONE_SIGNIN, signInWithApple, signInWithGoogle } from '@/lib/oauth';
import { type AuthMode } from '@/lib/otp';
import { supabase, supabaseConfigured } from '@/lib/supabase';

// Screens s61 (Create your account) and s10 (Welcome back): Google and Apple at launch. The same
// button creates the account the first time and logs in after that. Phone code is hidden until
// WhatsApp codes are set up (EXPO_PUBLIC_PHONE_SIGNIN).
const copy = {
  signup: {
    title: 'Create your account',
    sub: 'Join with Google or Apple. It takes a few seconds.',
    switchQ: 'Already have an account?',
    switchLink: 'Log in',
    switchTo: '/log-in',
  },
  login: {
    title: 'Welcome back',
    sub: 'Log in with the account you joined with.',
    switchQ: 'New to tabkheen A?',
    switchLink: 'Sign up',
    switchTo: '/sign-up',
  },
} as const;

export function AuthChoice({ mode }: { mode: AuthMode }) {
  const t = copy[mode];
  const [busy, setBusy] = useState<OAuthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const none = !GOOGLE_SIGNIN && !APPLE_SIGNIN && !PHONE_SIGNIN;

  async function go(method: OAuthMethod) {
    if (busy) return;
    if (!supabaseConfigured) {
      setError('The app isn’t connected to the server yet.');
      return;
    }
    setBusy(method);
    setError(null);
    logFunnel('signup_method_chosen', { method, mode });
    const res: OAuthResult = await (method === 'google' ? signInWithGoogle() : signInWithApple());
    if (!res.ok) {
      setBusy(null);
      if (!res.cancelled) setError(res.message);
      return;
    }
    const { data: profile } = await supabase.rpc('my_profile');
    setBusy(null);
    const done = Boolean((profile as { username: string | null } | null)?.username);
    router.replace(done ? '/home' : '/sign-up/profile');
  }

  function onHelp() {
    logFunnel('help_opened', { from: mode === 'signup' ? 'signup' : 'login' });
    Alert.alert('Contact us', 'Support by chat, phone and WhatsApp is coming soon.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pad}>
        <BackHeader />
        <View style={{ marginTop: 22 }}>
          <Text style={formStyles.title}>{t.title}</Text>
          <Text style={formStyles.sub}>{t.sub}</Text>
        </View>

        <View style={styles.buttons}>
          {GOOGLE_SIGNIN ? <ChoiceButton label="Continue with Google" busy={busy === 'google'} onPress={() => go('google')} variant="light" /> : null}
          {APPLE_SIGNIN ? <ChoiceButton label="Continue with Apple" busy={busy === 'apple'} onPress={() => go('apple')} variant="dark" /> : null}
          {PHONE_SIGNIN ? (
            <ChoiceButton label="Continue with phone" busy={false} onPress={() => router.push({ pathname: '/phone', params: { mode } })} variant="teal" />
          ) : null}
          {none ? <Text style={formStyles.hint}>Sign-in isn’t set up on this build yet.</Text> : null}
        </View>

        {error ? <Text style={[formStyles.error, { textAlign: 'center', marginTop: 14 }]}>{error}</Text> : null}

        <Text style={[formStyles.small, { marginTop: 22 }]} onPress={() => router.replace('/home')}>
          <Text style={formStyles.link}>Browse without an account</Text>
        </Text>

        <View style={{ flex: 1 }} />
        <Text style={[formStyles.small, { marginTop: 28 }]}>
          Trouble signing in?{' '}
          <Text style={formStyles.link} onPress={onHelp}>
            Contact us
          </Text>
        </Text>
        <Text style={[formStyles.small, { marginTop: 10 }]}>
          {t.switchQ}{' '}
          <Text style={formStyles.link} onPress={() => router.replace(t.switchTo)}>
            {t.switchLink}
          </Text>
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChoiceButton({ label, busy, onPress, variant }: { label: string; busy: boolean; onPress: () => void; variant: 'light' | 'dark' | 'teal' }) {
  const dark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={[styles.btn, variant === 'light' && styles.light, dark && styles.dark, variant === 'teal' && styles.teal, busy && { opacity: 0.6 }]}>
      <Text style={[styles.btnText, dark && { color: colors.white }]}>{busy ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 26 },
  buttons: { marginTop: 32, gap: 12 },
  btn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: colors.navy },
  light: { backgroundColor: colors.white },
  dark: { backgroundColor: colors.navy },
  teal: { backgroundColor: colors.teal, borderColor: colors.teal },
  btnText: { fontFamily: fonts.extraBold, fontSize: 15.5, color: colors.navy },
});
