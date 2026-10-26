import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { lang as appLang, setLanguage } from '@/lib/i18n';
import { BuildInfo } from '@/components/build-info';
import { Logo } from '@/components/logo';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { APPLE_SIGNIN, GOOGLE_SIGNIN } from '@/lib/oauth';
import { useOAuthFlow } from '@/lib/use-oauth-flow';
import { useSession } from '@/lib/session';
import { type Lang, welcomeCopy } from '@/lib/welcome-copy';

// Flow 1/2, screen s1: Welcome. The food artwork carries its own dark navy, used on this screen only.
const ART = require('@/assets/images/welcome-art.jpg');
const ART_NAVY = '#0f2330';
const GOOGLE_G = require('@/assets/images/google-g.png');
const APPLE_LOGO = require('@/assets/images/apple-white.png');

export default function Welcome() {
  const { loading, session, needsProfile } = useSession();
  const [lang, setLang] = useState<Lang>(appLang);
  const { busy, error, go } = useOAuthFlow('welcome');
  const t = welcomeCopy[lang];
  const showWelcome = !loading && !session;

  useEffect(() => {
    if (showWelcome) logFunnel('welcome_viewed', { lang });
    // Once per visit, not on every language switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome]);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('dark');
    }, []),
  );

  if (loading) return <View style={styles.screen} />;
  if (session) return <Redirect href={needsProfile ? '/sign-up/profile' : '/home'} />;

  return (
    <View style={styles.screen}>
      <Image source={ART} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.langRow}>
          {(['en', 'ar'] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => {
                setLang(l);
                setLanguage(l);
              }}
              accessibilityRole="button"
              accessibilityLabel={l === 'en' ? 'English' : 'العربية'}
              style={[styles.langBtn, lang === l && styles.langOn]}
            >
              <Text style={[styles.langText, lang === l && styles.langTextOn]}>{l === 'en' ? 'EN' : 'ع'}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.hero}>
          <Logo on="dark" height={50} />
          <Text style={styles.tagline}>
            {t.tagA}
            <Text style={styles.taglineAccent}>{t.tagB}</Text>
          </Text>
        </View>

        <View style={styles.actions}>
          {GOOGLE_SIGNIN ? (
            <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} disabled={busy !== null} onPress={() => go('google')} accessibilityRole="button">
              <View style={styles.googleBadge}>
                <Image source={GOOGLE_G} style={styles.icon} accessible={false} />
              </View>
              <Text style={styles.primaryText}>{t.google}</Text>
            </Pressable>
          ) : null}
          {APPLE_SIGNIN ? (
            <Pressable style={[styles.secondary, busy && { opacity: 0.6 }]} disabled={busy !== null} onPress={() => go('apple')} accessibilityRole="button">
              <Image source={APPLE_LOGO} style={styles.appleIcon} accessible={false} />
              <Text style={styles.secondaryText}>{t.apple}</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={() => router.push('/log-in')} accessibilityRole="link" style={styles.otherLink}>
            <Text style={styles.otherText}>{t.other}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.how} onPress={() => router.push({ pathname: '/how-it-works', params: { lang } })}>
          <MaterialIcons name="play-circle-filled" size={28} color={colors.white} />
          <Text style={styles.howText}>{t.how}</Text>
        </Pressable>
        <Text style={[styles.legal, lang === 'ar' && { writingDirection: 'rtl' }]}>
          {t.agree}
          <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'terms', lang } })} accessibilityRole="link">{t.terms}</Text>
          {t.and}
          <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal/[slug]', params: { slug: 'privacy', lang } })} accessibilityRole="link">{t.privacy}</Text>
        </Text>
        <View style={{ marginTop: 4, marginBottom: 8 }}>
          <BuildInfo onDark />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ART_NAVY },
  safe: { flex: 1, paddingHorizontal: 24 },
  langRow: { flexDirection: 'row', alignSelf: 'center', marginTop: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.14)', padding: 3 },
  langBtn: { minWidth: 56, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  langOn: { backgroundColor: colors.white },
  langText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  langTextOn: { color: colors.ink },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 36 },
  tagline: { fontFamily: fonts.bold, fontSize: 20, color: colors.white, textAlign: 'center' },
  taglineAccent: { color: colors.yellow },
  actions: { gap: 16, paddingHorizontal: 12 },
  primary: { backgroundColor: colors.teal, borderRadius: 999, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  googleBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 17, height: 17 },
  appleIcon: { width: 24, height: 24 },
  primaryText: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.navy },
  secondary: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.45)', paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  error: { fontFamily: fonts.semiBold, fontSize: 13.5, color: colors.white, textAlign: 'center' },
  otherLink: { alignItems: 'center', paddingVertical: 4 },
  otherText: { fontFamily: fonts.bold, fontSize: 14, color: 'rgba(255,255,255,.85)', textDecorationLine: 'underline' },
  legal: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,.75)', textAlign: 'center', marginHorizontal: 16 },
  legalLink: { fontFamily: fonts.bold, color: colors.white, textDecorationLine: 'underline' },
  how: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 40, marginBottom: 16, marginHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.35)', paddingVertical: 14 },
  howText: { fontFamily: fonts.bold, fontSize: 17, color: colors.white },
});
