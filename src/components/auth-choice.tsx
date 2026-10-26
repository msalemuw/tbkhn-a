import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { t } from '@/lib/i18n';
import { BackHeader, formStyles } from '@/components/form';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { APPLE_SIGNIN, GOOGLE_SIGNIN, PHONE_SIGNIN } from '@/lib/oauth';
import { type AuthMode } from '@/lib/otp';
import { useOAuthFlow } from '@/lib/use-oauth-flow';

// Screens s61 (Create your account) and s10 (More sign-in options). Google and Apple are the launch sign-in: the same
// button creates the account the first time and logs in after that. The welcome screen already has them, so the
// "login" screen (reached from "More sign-in options") shows only the other ways in: phone code (hidden until WhatsApp
// codes are set up, EXPO_PUBLIC_PHONE_SIGNIN) and the store reviewers' demo sign-in.
const GOOGLE_G = require('@/assets/images/google-g.png');
const APPLE_LOGO = require('@/assets/images/apple-white.png');

const copy = {
  signup: {
    title: t('Create your account'),
    sub: t('Join with Google or Apple. It takes a few seconds.'),
    switchQ: t('Already have an account?'),
    switchLink: t('Log in'),
    switchTo: '/log-in',
  },
  login: {
    title: t('More sign-in options'),
    sub: t('Other ways to get into your account.'),
    switchQ: t('New to tabkheen A?'),
    switchLink: t('Sign up'),
    switchTo: '/sign-up',
  },
} as const;

export function AuthChoice({ mode }: { mode: AuthMode }) {
  const c = copy[mode];
  const { busy, error, go } = useOAuthFlow(mode);
  const login = mode === 'login';
  const showGoogle = !login && GOOGLE_SIGNIN;
  const showApple = !login && APPLE_SIGNIN;
  const none = !showGoogle && !showApple && !PHONE_SIGNIN && !login;

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
          {showGoogle ? <ChoiceButton label={t('Continue with Google')} busy={busy === 'google'} onPress={() => go('google')} variant="light" icon={GOOGLE_G} /> : null}
          {showApple ? <ChoiceButton label={t('Continue with Apple')} busy={busy === 'apple'} onPress={() => go('apple')} variant="dark" icon={APPLE_LOGO} /> : null}
          {PHONE_SIGNIN ? (
            <ChoiceButton label={t('Continue with phone')} busy={false} onPress={() => router.push({ pathname: '/phone', params: { mode } })} variant="teal" />
          ) : null}
          {login ? <ChoiceButton label="Demo sign-in (app reviewers)" busy={false} onPress={() => router.push('/review-login')} variant="light" /> : null}
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
        {login ? null : (
          <Text style={[formStyles.small, { marginTop: 10 }]} onPress={() => router.push('/review-login')} accessibilityRole="link">
            App store reviewer? <Text style={formStyles.link}>Demo sign-in</Text>
          </Text>
        )}
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

function ChoiceButton({ label, busy, onPress, variant, icon }: { label: string; busy: boolean; onPress: () => void; variant: 'light' | 'dark' | 'teal'; icon?: number }) {
  const dark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={[styles.btn, variant === 'light' && styles.light, dark && styles.dark, variant === 'teal' && styles.teal, busy && { opacity: 0.6 }]}>
      {icon ? <Image source={icon} style={styles.icon} accessible={false} /> : null}
      <Text style={[styles.btnText, dark && { color: colors.white }]}>{busy ? t('Please wait…') : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  pad: { flexGrow: 1, paddingHorizontal: 22, paddingBottom: 26 },
  buttons: { marginTop: 32, gap: 12 },
  btn: { borderRadius: 14, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.navy },
  icon: { width: 20, height: 20 },
  light: { backgroundColor: colors.white },
  dark: { backgroundColor: colors.navy },
  teal: { backgroundColor: colors.teal, borderColor: colors.teal },
  btnText: { fontFamily: fonts.extraBold, fontSize: 15.5, color: colors.navy },
});
