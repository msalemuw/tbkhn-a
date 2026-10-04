import { Redirect, router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { useSession } from '@/lib/session';
import { type Lang, welcomeCopy } from '@/lib/welcome-copy';

// Flow 1/2, screen s1: Welcome, on the brand navy.
const NAVY = '#28303a';
export default function Welcome() {
  const { loading, session, needsProfile } = useSession();
  const [lang, setLang] = useState<Lang>('en');
  const t = welcomeCopy[lang];
  const align = t.dir === 'rtl' ? 'right' : 'left';
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.langRow}>
        {(['en', 'ar'] as const).map((l) => (
          <Pressable key={l} onPress={() => setLang(l)} style={[styles.langBtn, lang === l && styles.langOn]}>
            <Text style={[styles.langText, lang === l && styles.langTextOn]}>{l === 'en' ? 'EN' : 'ع'}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.body}>
        {/* Design s1: lockup | Arabic name in English; the Arabic name leads in Arabic. Never on a box. */}
        {lang === 'en' ? (
          <View style={styles.logoRow}>
            <Logo on="dark" height={34} />
            <View style={styles.logoDivider} />
            <Text style={styles.arNameSmall}>طابخين إيه</Text>
          </View>
        ) : (
          <View style={[styles.logoRow, styles.logoRowAr]}>
            <Text style={styles.arName}>طابخين إيه</Text>
            <View style={styles.logoDivider} />
            <Logo on="dark" height={22} />
          </View>
        )}
        <Text style={[styles.title, { textAlign: align }]}>{t.t1}</Text>
        <Text style={[styles.title, styles.titleAccent, { textAlign: align }]}>{t.t2}</Text>
        <Text style={[styles.sub, { textAlign: align }]}>{t.sub}</Text>
        <Text style={[styles.cta, { textAlign: align }]}>{t.cta}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => router.push('/log-in')}>
          <Text style={styles.primaryText}>{t.login}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.replace('/home')}>
          <Text style={styles.secondaryText}>{t.browse}</Text>
        </Pressable>
        <Text style={styles.newq}>
          {t.newq}{' '}
          <Text style={styles.link} onPress={() => router.push('/sign-up')}>
            {t.signup}
          </Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NAVY, paddingHorizontal: 24 },
  langRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.5)', padding: 2 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  langOn: { backgroundColor: colors.white },
  langText: { fontFamily: fonts.bold, color: colors.white, fontSize: 13 },
  langTextOn: { color: colors.ink },
  body: { flex: 1, justifyContent: 'flex-end', gap: 12, paddingBottom: 24 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  logoRowAr: { alignSelf: 'flex-end' },
  arName: { fontFamily: fonts.extraBold, fontSize: 40, color: colors.white },
  arNameSmall: { fontFamily: fonts.bold, fontSize: 28, color: 'rgba(255,255,255,.92)' },
  logoDivider: { width: 1.5, height: 30, backgroundColor: 'rgba(255,255,255,.35)' },
  title: { fontFamily: fonts.serif, fontSize: 32, lineHeight: 35, color: colors.white },
  titleAccent: { color: colors.white, marginTop: -12 },
  sub: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,.88)' },
  cta: { fontFamily: fonts.semiBold, fontSize: 15, lineHeight: 22, color: colors.white },
  actions: { gap: 12, paddingBottom: 16 },
  primary: { backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontFamily: fonts.extraBold, fontSize: 16, color: colors.white },
  secondary: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.25)', backgroundColor: 'rgba(255,255,255,.1)' },
  secondaryText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  newq: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,.88)', textAlign: 'center' },
  link: { fontFamily: fonts.extraBold, color: colors.white },
});
