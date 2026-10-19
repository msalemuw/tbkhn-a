import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { t } from '@/lib/i18n';
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
    title: t('Create your account'),
    sub: t('Join with Google or Apple. It takes a few seconds.'),
    switchQ: t('Already have an account?'),
    switchLink: t('Log in'),
    switchTo: '/log-in',
  },
  login: {
    title: t('Welcome back'),
    sub: t('Log in with the account you joined with.'),
    switchQ: t('New to tabkheen A?'),
    switchLink: t('Sign up'),
    switchTo: '/sign-up',
  },
} as const;

export function AuthChoice({ mode }: { mode: AuthMode }) {
  const c = copy[mode];
  const [busy, setBusy] = useState<OAuthMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const none = !GOOGLE_SIGNIN && !APPLE_SIGNIN && !PHONE_SIGNIN;

  async function go(method: OAuthMethod) {
    if (busy) return;
    if (!supabaseConfigured) {
      setError(t('The app isn’t connected to the server yet.'));
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
    router.push('/support');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pad}>
        <BackHeader />
        <View style={{ marginTop: 22 }}>
          <Text style={formStyles.title}>{c.title}</Text>
          <Text style={formStyles.sub}>{c.sub}</Text>
        </View>

        <View style={styles.buttons}>
          {GOOGLE_SIGNIN ? <ChoiceButton label={t('Continue with Google')} busy={busy === 'google'} onPress={() => go('google')} variant="light" /> : null}
          {APPLE_SIGNIN ? <ChoiceButton label={t('Continue with Apple')} busy={busy === 'apple'} onPress={() => go('apple')} variant="dark" /> : null}
          {PHONE_SIGNIN ? (
            <ChoiceButton label={t('Continue with phone')} busy={false} onPress={() => router.push({ pathname: '/phone', params: { mode } })} variant="teal" />
          ) : null}
          {none ? <Text style={formStyles.hint}>{t('Sign-in isn’t set up on this build yet.')}</Text> : null}
        </View>

        {error ? <Text style={[formStyles.error, { textAlign: 'center', marginTop: 14 }]}>{error}</Text> : null}

        <View style={{ flex: 1 }} />
        <Text style={[formStyles.small, { marginTop: 28 }]}>
          {t('Trouble signing in?')}{' '}
          <Text style={formStyles.link} onPress={onHelp}>
            {t('Contact us')}
          </Text>
        </Text>
        <Text style={[formStyles.small, { marginTop: 10 }]} onPress={() => router.push('/review-login')} accessibilityRole="link">
          App store reviewer? <Text style={formStyles.link}>Demo sign-in</Text>
        </Text>
        <Text style={[formStyles.small, { marginTop: 10 }]}>
          {c.switchQ}{' '}
          <Text style={formStyles.link} onPress={() => router.replace(c.switchTo)}>
            {c.switchLink}
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
      <Text style={[styles.btnText, dark && { color: colors.white }]}>{busy ? t('Please wait…') : label}</Text>
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
