import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuildInfo } from '@/components/build-info';
import { Logo } from '@/components/logo';
import { colors, fonts } from '@/constants/theme';
import { logFunnel } from '@/lib/funnel';
import { useSession } from '@/lib/session';
import { type Lang, welcomeCopy } from '@/lib/welcome-copy';

// Flow 1/2, screen s1: Welcome. The food artwork carries its own dark navy, used on this screen only.
const ART = require('@/assets/images/welcome-art.jpg');
const ART_NAVY = '#0f2330';

export default function Welcome() {
  const { loading, session, needsProfile } = useSession();
  const [lang, setLang] = useState<Lang>('en');
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
              onPress={() => setLang(l)}
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
          <Pressable style={styles.primary} onPress={() => router.push('/sign-up')}>
            <Text style={styles.primaryText}>{t.create}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => router.push('/log-in')}>
            <Text style={styles.secondaryText}>{t.login}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.how} onPress={() => router.push({ pathname: '/how-it-works', params: { lang } })}>
          <MaterialIcons name="play-circle-filled" size={28} color={colors.white} />
          <Text style={styles.howText}>{t.how}</Text>
        </Pressable>
        <View style={{ marginTop: -12, marginBottom: 8 }}>
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
  primary: { backgroundColor: colors.teal, borderRadius: 999, paddingVertical: 18, alignItems: 'center' },
  primaryText: { fontFamily: fonts.extraBold, fontSize: 18, color: colors.navy },
  secondary: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.45)', paddingVertical: 16, alignItems: 'center' },
  secondaryText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  how: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 56, marginBottom: 24, marginHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.35)', paddingVertical: 14 },
  howText: { fontFamily: fonts.bold, fontSize: 17, color: colors.white },
});
